# Browser smoke check

The browser check uses Playwright, installed in a scratch folder **outside the repo** (the repo stays free of npm dependencies). `playwright-core` with the installed Edge (`channel: 'msedge'`) works on the owner's machine, so no browser download is needed.

```sh
mkdir quizy-smoke && cd quizy-smoke
npm init -y && npm i playwright-core
# save smoke.cjs and compare.cjs from below into this folder, then:
node smoke.cjs <path-to-Quizy> baseline     # before a change (e.g. on main)
node smoke.cjs <path-to-Quizy> candidate    # after the change
node compare.cjs baseline candidate         # identical text, scores and screenshots?
ALL=1 node smoke.cjs <path-to-Quizy> out    # also: every NLP question, every non-single DVE question, a partial-marks round
node newtypes.cjs <repo-with-new-sets> nt   # short / numeric / written end to end (see below)
node paper.cjs <repo-with-new-sets> pp       # mock papers, label, practise by style, lecture chips (see below)
node maths.cjs <repo-with-maths-check> mx    # maths rendering and Browse & search (see below)
```

## What it does

For `file://` and a local HTTP server, at 375×667 and 1280×800:

- Screenshots the setup screen of every subject (DVE, NLP, DO's "No quizzes yet") and records its text, sets, lecture chips, styles, theme tokens, theme colour and favicon.
- Plays seeded rounds (`index.html?seed=7`, see `src/core/random.js`): NLP all correct (expected **50 / 50 marks**), NLP all wrong with every multi option ticked (expected **0 / 50 marks**), then DVE all correct (**421 out of 421 correct**) and all wrong. The same seed replays the same order, so the two rounds can be compared question by question. For every question it records the source line, question, hints and options HTML before and after answering, the feedback, the "Next" label and the stats.
- Screenshots the first answered `multi`, the first answered `match`, NLP Q20 (with the image) and the summary, both viewport-only and full page.
- At 375×667 it measures, after each question's scroll has settled, that the question text, progress bar and "End round" are on the first screen (last result: the question starts at most 301px from the top, on question 1).
- Checks that nothing scrolls sideways, that visible buttons, selects, options and checkbox rows are ≥ 48px tall, and that there are no console errors.
- Checks storage: the last subject is remembered; seeding `quizy-dve-attempts-v1` with 2 correct + 1 wrong gives 2 / 1 in the DVE stats and copies the value to `quizy-attempts-v2-dve` while keeping the old key; existing v2 data is never overwritten; broken JSON in storage is ignored.
- Checks that without `?seed` two loads give different orders (Math.random is still used).

Things to know when changing it:
- The lecture chips are remembered per subject, so after picking "L3" the script taps "All" again before the full DVE rounds.
- The 2026-10-12 setup screen (lecture chips, style select, mock-test block) changed the setup text and the 8 full-page setup screenshots; the baseline was retaken then. Everything else stayed byte-identical.
- The "Browse all questions" button (added after the mock papers) changed the setup text by that one line and the same 8 full-page setup screenshots; the baseline was retaken then. Everything else stayed byte-identical.
- After every navigation, wait for `.subject-tab[aria-pressed=true]`: over HTTP the data loads asynchronously.
- Wait for smooth scrolling to finish before screenshots or measurements by polling `scrollY` inside `page.evaluate` until it stops changing. Don't return a Promise from `page.waitForFunction`; it counts as truthy straight away.
- Let the scroll settle before clicking "See results". Otherwise two smooth scrolls overlap and the summary can stop a few pixels short of the top, which makes screenshots flaky.
- Don't run two smoke runs at once: images can then differ by a pixel or so.

## smoke.cjs

```js
// Quizy smoke run: node smoke.cjs <repoDir> <outDir>
// Plays seeded rounds for DVE and NLP over file:// and HTTP at 375x667 and 1280x800,
// records DOM text, scores and summaries, takes screenshots and checks layout rules.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const repo = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive: true});
const SEED = 7;
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        const index = path.join(file, 'index.html');
        if (fs.existsSync(index)) { res.writeHead(200, {'content-type': 'text/html'}); return res.end(fs.readFileSync(index)); }
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
      res.end(fs.readFileSync(file));
    });
    server.listen(0, () => resolve(server));
  });
}

const ready = page => page.waitForSelector('.subject-tab[aria-pressed=true]', {state: 'attached'});

async function settle(page) {
  // Wait until scrollY stops changing (smooth scrolling has finished).
  await page.evaluate(async () => {
    let last = -1, same = 0;
    for (let i = 0; i < 100 && same < 6; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (window.scrollY === last) same++; else { same = 0; last = window.scrollY; }
    }
  });
}

// In-page helpers: identify the current question and answer it.
const pageHelpers = () => {
  window.__smoke = {
    findQuestion(setId) {
      const set = window.QUIZY_DATA.sets[setId];
      const text = document.getElementById('question').textContent;
      const items = document.getElementById('choices').children;
      const candidates = set.questions.filter(q => q.question === text);
      if (candidates.length === 1) return candidates[0];
      const sig = [...items].map(n => n.dataset.original).join(',');
      const found = candidates.find(q => (q.choices || q.pairs).length === items.length);
      if (!found) throw new Error('question not found: ' + text.slice(0, 60) + ' ' + sig);
      return found;
    },
    layout() {
      const doc = document.documentElement;
      const small = [];
      for (const node of document.querySelectorAll('button, select, .choice, input[type=checkbox], input[type=text]')) {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height || node.closest('[hidden]')) continue;
        const target = node.matches('input[type=checkbox]') ? node.closest('label').getBoundingClientRect() : box;
        if (target.height < 47.5) small.push(`${node.tagName}#${node.id}.${node.className} ${target.height}`);
      }
      return {hScroll: doc.scrollWidth > doc.clientWidth, small};
    },
    snapshot() {
      const t = id => document.getElementById(id).innerText;
      return {
        position: t('position'), source: t('source'), question: document.getElementById('question').innerHTML,
        hints: t('hints'), choices: document.getElementById('choices').innerHTML,
        checkHidden: document.getElementById('check').hidden, checkDisabled: document.getElementById('check').disabled,
        image: document.getElementById('figure').hidden ? null : document.getElementById('figure-img').getAttribute('src')
      };
    },
    answer(setId, mode) {
      const q = this.findQuestion(setId);
      const right = mode !== false && mode !== 'wrong';
      const partial = mode === 'partial';
      const choices = document.getElementById('choices');
      const before = this.snapshot();
      if (q.type === 'single' || q.type === 'truefalse') {
        const buttons = [...choices.children];
        const pick = buttons.find(b => q.answer.includes(Number(b.dataset.original)) === right);
        pick.click();
      } else if (q.type === 'multi') {
        const boxes = [...choices.querySelectorAll('input')];
        const firstWrong = boxes.find(b => !q.answer.includes(Number(b.value)));
        const firstRight = boxes.find(b => q.answer.includes(Number(b.value)));
        for (const box of boxes) if (partial ? (box === firstWrong || box === firstRight) : (!right || q.answer.includes(Number(box.value)))) { box.checked = true; box.dispatchEvent(new Event('change')); }
        before.checkDisabledAfterPick = document.getElementById('check').disabled;
        document.getElementById('check').click();
      } else if (q.type === 'match') {
        let rowIndex = 0;
        for (const row of choices.children) {
          const rowRight = partial ? rowIndex++ === 0 : right;
          const pair = q.pairs[Number(row.dataset.original)];
          const select = row.querySelector('select');
          const option = [...select.options].find(o => o.value !== '' && (q.options[Number(o.value)] === pair.answer) === rowRight);
          select.value = option.value;
          select.dispatchEvent(new Event('change'));
        }
        before.checkDisabledAfterPick = document.getElementById('check').disabled;
        document.getElementById('check').click();
      }
      return {id: q.id, type: q.type, hasImage: !!q.image, before, after: {
        choices: choices.innerHTML, feedback: document.getElementById('feedback').innerHTML,
        feedbackClass: document.getElementById('feedback').className,
        nextText: document.getElementById('next').textContent,
        stats: ['total-count', 'correct-count', 'review-count', 'bank-count'].map(id => document.getElementById(id).textContent)
      }};
    }
  };
};

async function playRound(page, cfg, subjectKey, setId, right, shots) {
  await page.goto(cfg.url + '?seed=' + SEED); await ready(page);
  await page.evaluate(pageHelpers);
  await page.click(`.subject-tab[data-key=${subjectKey}]`);
  await page.selectOption('#set', setId);
  await page.click('#start');
  await settle(page);
  const items = [];
  const qTops = [];
  const total = await page.evaluate(() => Number(document.getElementById('progress').max));
  let firstOf = {};
  for (let i = 0; i < total; i++) {
    if (cfg.measureTops) {
      await settle(page);
      qTops.push(await page.evaluate(() => {
        const r = id => document.getElementById(id).getBoundingClientRect();
        return {q: Math.round(r('question').top), progress: Math.round(r('progress').bottom), quit: Math.round(r('quit').bottom), vh: innerHeight};
      }));
    }
    const res = await page.evaluate(([s, r]) => window.__smoke.answer(s, r), [setId, right]);
    items.push(res);
    if (process.env.ALL && (subjectKey === 'nlp' || res.type !== 'single')) {
      await settle(page);
      await page.waitForFunction(() => [...document.images].every(img => img.complete));
      await page.screenshot({path: path.join(out, `${cfg.name}-${subjectKey}-${right}-${String(i).padStart(3, '0')}.png`), fullPage: true});
    }
    if (shots) {
      let tag = null;
      if (res.type === 'multi' && !firstOf.multi) tag = firstOf.multi = 'multi';
      else if (res.type === 'match' && !firstOf.match) tag = firstOf.match = 'match';
      else if (res.hasImage && !firstOf.image) tag = firstOf.image = 'image';
      if (tag) {
        await settle(page);
        await page.waitForFunction(() => [...document.images].every(img => img.complete));
        await page.screenshot({path: path.join(out, `${cfg.name}-${subjectKey}-${tag}-view.png`)});
        await page.screenshot({path: path.join(out, `${cfg.name}-${subjectKey}-${tag}-full.png`), fullPage: true});
      }
      if (i === 0) cfg.layout.push({where: `${subjectKey} q1 answered`, ...(await page.evaluate(() => window.__smoke.layout()))});
    }
    if (i === total - 1) await settle(page);
    await page.evaluate(() => document.getElementById('next').click());
  }
  await settle(page);
  const summary = await page.evaluate(() => ({title: document.getElementById('summary-title').textContent, detail: document.getElementById('summary-detail').textContent, view: document.body.dataset.view}));
  if (shots) {
    await page.screenshot({path: path.join(out, `${cfg.name}-${subjectKey}-summary-view.png`)});
    await page.screenshot({path: path.join(out, `${cfg.name}-${subjectKey}-summary-full.png`), fullPage: true});
    cfg.layout.push({where: `${subjectKey} summary`, ...(await page.evaluate(() => window.__smoke.layout()))});
  }
  return {items, summary, qTops};
}

(async () => {
  const server = await serve();
  const fileUrl = 'file:///' + path.join(repo, 'index.html').replace(/\\/g, '/');
  const httpUrl = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch({channel: 'msedge'});
  const results = {};
  const problems = [];
  for (const [mode, url] of [['file', fileUrl], ['http', httpUrl]]) {
    for (const [w, h] of [[375, 667], [1280, 800]]) {
      const name = `${mode}-${w}`;
      const context = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 1});
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => consoleErrors.push(String(e)));
      const cfg = {name, url, layout: [], measureTops: w === 375};
      const r = {};

      // Setup screens (fresh storage).
      await page.goto(url); await ready(page);
      await page.evaluate(pageHelpers);
      for (const key of ['dve', 'nlp', 'do']) {
        await page.click(`.subject-tab[data-key=${key}]`);
        await settle(page);
        await page.screenshot({path: path.join(out, `${name}-${key}-setup-view.png`)});
        await page.screenshot({path: path.join(out, `${name}-${key}-setup-full.png`), fullPage: true});
        r[`${key}-setup`] = await page.evaluate(() => ({
          main: document.querySelector('main').innerText, title: document.title,
          aside: document.querySelector('aside').innerText,
          themeColor: document.querySelector('meta[name=theme-color]').content,
          icon: document.querySelector('link[rel=icon]').href,
          tokens: document.documentElement.getAttribute('style'),
          sets: [...document.getElementById('set').options].map(o => o.value + '|' + o.text),
          lectures: [...document.querySelectorAll('#lectures .chip')].map(c => c.dataset.lecture + '|' + c.textContent + '|' + c.getAttribute('aria-pressed') + (c.classList.contains('none') ? '|none' : '')),
          styles: [...document.getElementById('style').options].map(o => o.value + '|' + o.text)
        }));
        cfg.layout.push({where: `${key} setup`, ...(await page.evaluate(() => window.__smoke.layout()))});
      }
      // Lecture filter + review mode note text on DVE.
      await page.click('.subject-tab[data-key=dve]');
      await page.click('#lectures .chip[data-lecture="3"]');
      r['dve-note-l3'] = await page.textContent('#bank-note');
      await page.selectOption('#mode', 'review');
      await page.click('#start');
      r['dve-review-empty'] = await page.textContent('#setup-message');
      await page.selectOption('#mode', 'all');
      r['dve-note-back'] = await page.textContent('#bank-note') + '|' + await page.textContent('#setup-message');
      await page.click('#lectures .chip[data-lecture="all"]'); // the chips are remembered per subject

      // NLP: right round (with screenshots), then wrong round, same seed => same order.
      r['nlp-right'] = await playRound(page, cfg, 'nlp', 'nlp-past-quiz-2-2025', true, true);
      r['nlp-wrong'] = await playRound(page, cfg, 'nlp', 'nlp-past-quiz-2-2025', false, false);
      if (process.env.ALL) r['nlp-partial'] = await playRound(page, cfg, 'nlp', 'nlp-past-quiz-2-2025', 'partial', false);
      await page.click('#again');
      // Review mode now has all 25 questions; check the note.
      await page.selectOption('#mode', 'review');
      r['nlp-review-note'] = await page.textContent('#bank-note');
      // Last subject is remembered.
      await page.reload(); await ready(page);
      r['last-subject'] = await page.evaluate(() => document.querySelector('.subject-tab[aria-pressed=true]').dataset.key);

      cfg.measureTops = false;
      r['dve-right'] = await playRound(page, cfg, 'dve', 'dve-lecture-bank', true, true);
      r['dve-wrong'] = await playRound(page, cfg, 'dve', 'dve-lecture-bank', false, false);
      r['storage-after'] = await page.evaluate(() => Object.keys(localStorage).sort());

      // Storage migration: seed v1 DVE data, reload, check counts and keys.
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('quizy-dve-attempts-v1', JSON.stringify({'L1-001': {correct: true}, 'L1-002': {correct: false}, 'L2-001': {correct: true}}));
        localStorage.setItem('quizy-last-subject', 'dve');
      });
      await page.reload(); await ready(page);
      r['migration'] = await page.evaluate(() => ({
        correct: document.getElementById('correct-count').textContent,
        review: document.getElementById('review-count').textContent,
        v2: localStorage.getItem('quizy-attempts-v2-dve'), v1: localStorage.getItem('quizy-dve-attempts-v1')
      }));
      // Migration must not overwrite existing v2 data.
      await page.evaluate(() => localStorage.setItem('quizy-attempts-v2-dve', JSON.stringify({'L1-003': {correct: false, score: 0}})));
      await page.reload(); await ready(page);
      r['migration-noop'] = await page.evaluate(() => [document.getElementById('correct-count').textContent, document.getElementById('review-count').textContent]);
      // Broken storage JSON is tolerated.
      await page.evaluate(() => localStorage.setItem('quizy-attempts-v2-dve', '{oops'));
      await page.reload(); await ready(page);
      r['broken-storage'] = await page.evaluate(() => [document.getElementById('correct-count').textContent, document.getElementById('review-count').textContent]);

      r.consoleErrors = consoleErrors;
      r.layout = cfg.layout;
      for (const l of cfg.layout) if (l.hScroll || l.small.length) problems.push(`${name} ${l.where}: hScroll=${l.hScroll} small=${l.small.join('; ')}`);
      for (const [i, t] of (r['nlp-right'].qTops || []).entries()) if (t.q > t.vh - 40 || t.q < 0 || t.quit > t.vh) problems.push(`${name} nlp q${i + 1} not on first screen: ${JSON.stringify(t)}`);
      if (consoleErrors.length) problems.push(`${name} console: ${consoleErrors.join(' | ')}`);
      results[name] = r;
      console.log(name, 'NLP', r['nlp-right'].summary.title, '/', r['nlp-wrong'].summary.title, '· DVE', r['dve-right'].summary.title, '/', r['dve-wrong'].summary.title,
        '· max q top', Math.max(0, ...r['nlp-right'].qTops.map(t => t.q)), '· migration', r.migration.correct, r.migration.review);
      await context.close();
    }
  }
  // Without ?seed, two loads must give different orders (Math.random is still used).
  const context = await browser.newContext();
  const page = await context.newPage();
  const orders = [];
  for (let i = 0; i < 2; i++) {
    await page.goto(fileUrl); await ready(page);
    await page.click('.subject-tab[data-key=nlp]');
    await page.click('#start');
    orders.push(await page.evaluate(() => document.getElementById('question').textContent + document.getElementById('choices').innerText));
  }
  results.unseededDiffers = orders[0] !== orders[1];
  await context.close();
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  console.log('unseeded rounds differ:', results.unseededDiffers);
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'No layout/console problems.');
})().catch(e => { console.error(e); process.exit(1); });
```

## compare.cjs

```js
// node compare.cjs <baselineDir> <candidateDir>: deep-compares results.json and screenshots byte for byte.
const fs = require('node:fs');
const path = require('node:path');
const [a, b] = process.argv.slice(2).map(p => path.resolve(p));
let diffs = 0;
function walk(x, y, where) {
  if (diffs > 30) return;
  if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) { diffs++; return console.log('type', where); }
  if (x && typeof x === 'object') {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], where + '.' + k);
  } else if (x !== y) { diffs++; console.log('DIFF', where, '\n  -', String(x).slice(0, 300), '\n  +', String(y).slice(0, 300)); }
}
walk(JSON.parse(fs.readFileSync(path.join(a, 'results.json'))), JSON.parse(fs.readFileSync(path.join(b, 'results.json'))), 'results');
const pngs = fs.readdirSync(a).filter(f => f.endsWith('.png'));
let same = 0;
for (const f of pngs) {
  if (!fs.existsSync(path.join(b, f))) { diffs++; console.log('missing', f); continue; }
  if (Buffer.compare(fs.readFileSync(path.join(a, f)), fs.readFileSync(path.join(b, f))) === 0) same++;
  else { diffs++; console.log('PNG differs', f); }
}
console.log(`${same}/${pngs.length} screenshots identical; ${diffs} difference(s).`);
process.exit(diffs ? 1 : 0);
```

## newtypes.cjs

Plays one question of each typed type end to end over `file://` and HTTP at 375×667 and 1280×800, using the NLP `practice-quiz` (short) and `tutorial` (numeric, numeric grid, written) sets. It needs those ids in `data/subjects.json`. Until the content author adds them, run it on a scratch copy of the repo with the two ids appended to NLP's `sets` and `node tools/build-data.cjs` rerun there.

It checks:
- The "Answers on this set are unofficial" note and the paper-style count line.
- short: "Check answer" disabled until something is typed, Enter submits, case and spaces are ignored, the accepted answer is shown, and the heading reads "Study note (unofficial answer)".
- "Copy for Claude": "Copied ✓", the label resets after 2 s, the clipboard content, and the `execCommand` fallback when the Clipboard API rejects. On `file://` the clipboard is read back from an HTTP page, because file pages may write it but not read it.
- numeric: the unreadable-number note, fractions and decimal commas, partial marks, expected values, the worked solution before the study note, and a 2-column grid.
- written: the draft is restored after a reload, revealing shows the model answer and rubric without saving an attempt, and submitting saves the ticked marks.
- No sideways scroll, tap targets ≥ 48px (inputs, textareas and rubric rows included) and no console errors.

It writes full-page screenshots of each state to the output folder for a visual check. Windows returns clipboard text with CRLF line endings, so the script normalises them before comparing.

```js
// node newtypes.cjs <repoDir with the new sets in subjects.json> <outDir>
// Plays one question of each new type end to end over file:// and HTTP at 375x667 and 1280x800.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const repo = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const serve = () => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    const file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  server.listen(0, () => resolve(server));
});
const ready = page => page.waitForSelector('.subject-tab[aria-pressed=true]', {state: 'attached'});
const settle = page => page.evaluate(async () => {
  let last = -1, same = 0;
  for (let i = 0; i < 100 && same < 6; i++) { await new Promise(r => setTimeout(r, 50)); if (scrollY === last) same++; else { same = 0; last = scrollY; } }
});
const layout = page => page.evaluate(() => {
  const doc = document.documentElement;
  const small = [];
  for (const node of document.querySelectorAll('button, select, .choice, input, textarea, .rubric-point')) {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || node.closest('[hidden]') || getComputedStyle(node).opacity === '0') continue;
    const target = node.matches('input[type=checkbox]') ? node.closest('label').getBoundingClientRect() : box;
    if (target.height < 47.5) small.push(`${node.tagName}#${node.id}.${node.className} ${target.height}`);
  }
  return {hScroll: doc.scrollWidth > doc.clientWidth, small};
});
// Start a round with just this question, through the app's own startRound.
const play = (page, setId, qid) => page.evaluate(([setId, qid]) => {
  const set = Quizy.state.sets.find(s => s.id === setId);
  Quizy.ui.startRound(set, set.questions.filter(q => q.id === qid));
}, [setId, qid]);
const text = (page, sel) => page.evaluate(s => { const n = document.querySelector(s); return n && !n.closest('[hidden]') ? n.innerText : null; }, sel);

(async () => {
  const server = await serve();
  const fileUrl = 'file:///' + path.join(repo, 'index.html').replace(/\\/g, '/');
  const httpUrl = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch({channel: 'msedge'});
  const problems = [];
  const report = {};
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  for (const [mode, url] of [['file', fileUrl], ['http', httpUrl]]) {
    for (const [w, h] of [[375, 667], [1280, 800]]) {
      const name = `${mode}-${w}`;
      const context = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 1});
      if (mode === 'http') await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(httpUrl).origin});
      const page = await context.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      const r = report[name] = {};
      const shot = async tag => { await settle(page); await page.screenshot({path: path.join(out, `${name}-${tag}.png`), fullPage: true}); r[`layout-${tag}`] = await layout(page); };

      // Setup: unofficial note and the paper-style count line.
      await page.goto(url); await ready(page);
      await page.click('.subject-tab[data-key=nlp]');
      await page.selectOption('#set', 'nlp-practice-quiz');
      r.unofficial = await text(page, '#set-unofficial');
      r.notePractice = await page.textContent('#bank-note');
      await page.selectOption('#set', 'nlp-tutorial');
      r.noteTutorial = await page.textContent('#bank-note');
      await shot('setup-tutorial');
      await page.selectOption('#set', 'nlp-past-quiz-2-2025');
      r.unofficialPast = await text(page, '#set-unofficial');
      expect(r.unofficial === 'Answers on this set are unofficial' && r.unofficialPast === null, `${name} unofficial note`);
      expect(/^29 questions · 29 marks · order randomised$/.test(r.notePractice.replace(/^\d+/, '29')), `${name} practice note ${r.notePractice}`);

      // A real "Start quiz" round of the tutorial draws its first question without errors.
      await page.selectOption('#set', 'nlp-tutorial');
      await page.click('#start');
      r.firstTutorial = await page.textContent('#position');

      // short: Enter submits; case and spaces ignored.
      await play(page, 'nlp-practice-quiz', 'nlp-pq-3-1');
      r.shortCheckDisabled = await page.isDisabled('#check');
      await page.fill('#choices input', '  SoftMax ');
      r.shortCheckEnabled = !(await page.isDisabled('#check'));
      await page.press('#choices input', 'Enter');
      r.shortVerdict = await text(page, '#feedback .verdict');
      r.shortKey = await text(page, '.answer-key');
      r.shortNote = await text(page, '#feedback .study-note .eyebrow');
      r.shortInputAttrs = await page.evaluate(() => { const i = document.querySelector('#choices input'); return [i.getAttribute('autocapitalize'), i.getAttribute('autocomplete'), i.spellcheck, i.readOnly]; });
      expect(r.shortVerdict?.startsWith('Correct!') && r.shortCheckDisabled && r.shortCheckEnabled, `${name} short ${r.shortVerdict}`);
      expect(r.shortNote === 'STUDY NOTE (UNOFFICIAL ANSWER)', `${name} short note label ${r.shortNote}`);
      await shot('short');
      // Copy for Claude.
      await page.click('#copy-claude');
      await page.waitForFunction(() => document.getElementById('copy-claude').textContent !== 'Copy for Claude', null, {timeout: 3000}).catch(() => {});
      r.copyLabel = await page.textContent('#copy-claude');
      r.clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(e => 'read failed: ' + e.name));
      if (r.clipboard.startsWith('read failed')) {
        // file:// pages may write but not read the clipboard: read it back from an HTTP page instead.
        const reader = await browser.newContext();
        await reader.grantPermissions(['clipboard-read'], {origin: new URL(httpUrl).origin});
        const rp = await reader.newPage();
        await rp.goto(httpUrl);
        r.clipboard = await rp.evaluate(() => navigator.clipboard.readText());
        await reader.close();
      }
      r.clipboard = r.clipboard.replace(/\r\n/g, '\n');
      await page.waitForTimeout(2200);
      r.copyLabelAfter = await page.textContent('#copy-claude');
      expect(r.copyLabel === 'Copied ✓' && r.copyLabelAfter === 'Copy for Claude', `${name} copy label ${r.copyLabel} / ${r.copyLabelAfter}`);
      if (!r.clipboard.startsWith('read failed')) expect(r.clipboard.includes('Accepted answer:\nsoftmax') && r.clipboard.includes('My answer:\nSoftMax'), `${name} clipboard content`);
      // Fallback when the Clipboard API rejects.
      await page.waitForTimeout(2200);
      await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.reject(new Error('blocked'))}, configurable: true}); });
      await page.click('#copy-claude');
      await page.waitForFunction(() => document.getElementById('copy-claude').textContent !== 'Copy for Claude', null, {timeout: 3000}).catch(() => {});
      r.copyFallbackLabel = await page.textContent('#copy-claude');
      expect(r.copyFallbackLabel === 'Copied ✓', `${name} execCommand fallback ${r.copyFallbackLabel}`);

      // numeric, one part: an unreadable value shows a note; a fraction is accepted.
      await play(page, 'nlp-tutorial', 'nlp-tut-4-2');
      await page.fill('#choices input', '1/');
      await page.locator('#choices input').blur();
      r.numUnreadable = await text(page, '.numeric-note');
      await page.fill('#choices input', '1/120');
      r.numNoteCleared = await text(page, '.numeric-note');
      r.numInputMode = await page.getAttribute('#choices input', 'inputmode');
      await page.click('#check');
      r.numVerdict = await text(page, '#feedback .verdict');
      r.numFeedbackOrder = await page.evaluate(() => [...document.querySelectorAll('#feedback > div')].map(d => d.className + ':' + (d.querySelector('.eyebrow')?.textContent || '')));
      expect(r.numUnreadable === 'Couldn’t read this number.' && r.numNoteCleared === null && r.numInputMode === 'decimal', `${name} numeric note ${r.numUnreadable}`);
      expect(r.numVerdict?.includes('4 / 4 marks'), `${name} numeric verdict ${r.numVerdict}`);
      expect(r.numFeedbackOrder[1] === 'study-note solution:Worked solution', `${name} worked solution order ${r.numFeedbackOrder}`);
      await shot('numeric');

      // numeric, five parts (list layout), partly wrong.
      await play(page, 'nlp-tutorial', 'nlp-tut-3-2');
      const answers = await page.evaluate(() => Quizy.currentItem().q.parts.map(p => String(p.answer)));
      const inputs = page.locator('#choices input');
      for (let i = 0; i < answers.length; i++) await inputs.nth(i).fill(i === 1 ? 'oops' : i === 2 ? '0.9' : answers[i].replace('.', ','));
      r.parts5CheckEnabled = !(await page.isDisabled('#check'));
      await page.click('#check');
      r.parts5Verdict = await text(page, '#feedback .verdict');
      r.parts5Notes = await page.$$eval('.numeric-note', ns => ns.map(n => n.textContent));
      expect(r.parts5Verdict?.startsWith('Partly right.'), `${name} parts5 ${r.parts5Verdict}`);
      await shot('numeric-parts');

      // numeric, 2x2 grid.
      await play(page, 'nlp-tutorial', 'nlp-tut-5-4');
      r.gridCols = await page.evaluate(() => getComputedStyle(document.querySelector('.numeric-grid')).gridTemplateColumns.split(' ').length);
      r.gridLabels = await page.$$eval('#choices input', ns => ns.map(n => n.title + '|' + n.getAttribute('aria-label')));
      const grid = await page.evaluate(() => Quizy.currentItem().q.parts.map(p => String(p.answer)));
      for (let i = 0; i < grid.length; i++) await page.locator('#choices input').nth(i).fill(i === 3 ? '0.1' : grid[i]);
      await page.click('#check');
      r.gridVerdict = await text(page, '#feedback .verdict');
      expect(r.gridCols === 2, `${name} grid cols ${r.gridCols}`);
      await shot('numeric-grid');

      // written: type, reload, restore, reveal, tick, submit.
      await play(page, 'nlp-tutorial', 'nlp-tut-1-1');
      r.writtenCheck = [await page.textContent('#check'), await page.isDisabled('#check')];
      await page.fill('#choices textarea', 'Tokenisation splits text into tokens.\nAgglutinative words glue morphemes together.');
      await shot('written-typing');
      await page.reload(); await ready(page);
      await page.click('.subject-tab[data-key=nlp]');
      await play(page, 'nlp-tutorial', 'nlp-tut-1-1');
      r.writtenRestored = await page.inputValue('#choices textarea');
      expect(r.writtenRestored.startsWith('Tokenisation splits text') && r.writtenCheck[0] === 'Reveal model answer' && !r.writtenCheck[1], `${name} written restore/check ${JSON.stringify(r.writtenCheck)}`);
      await page.click('#check');
      r.writtenRevealed = await page.evaluate(() => ({
        readOnly: document.querySelector('#choices textarea').readOnly,
        model: !!document.querySelector('.written-model'),
        points: document.querySelectorAll('.rubric-point').length,
        submit: !!document.querySelector('.rubric-submit'),
        feedbackHidden: document.getElementById('feedback').hidden,
        checkHidden: document.getElementById('check').hidden,
        askShown: !document.getElementById('ask').hidden,
        saved: localStorage.getItem('quizy-attempts-v2-nlp')
      }));
      expect(r.writtenRevealed.readOnly && r.writtenRevealed.model && r.writtenRevealed.points > 0 && r.writtenRevealed.feedbackHidden && r.writtenRevealed.askShown && !(r.writtenRevealed.saved || '').includes('nlp-tut-1-1'), `${name} written reveal ${JSON.stringify(r.writtenRevealed)}`);
      await shot('written-revealed');
      await page.click('.rubric-point >> nth=0');
      const firstMarks = await page.evaluate(() => Quizy.currentItem().q.rubric[0].marks);
      await page.click('.rubric-submit');
      r.writtenVerdict = await text(page, '#feedback .verdict');
      r.writtenSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('quizy-attempts-v2-nlp'))['nlp-tut-1-1']);
      r.writtenText = await page.evaluate(() => JSON.parse(localStorage.getItem('quizy-written-v1-nlp')));
      expect(r.writtenSaved?.score === firstMarks && r.writtenVerdict?.includes(`${firstMarks} / 3 marks`), `${name} written score ${r.writtenVerdict}`);
      await page.click('#copy-claude');
      await page.waitForFunction(() => document.getElementById('copy-claude').textContent !== 'Copy for Claude', null, {timeout: 3000}).catch(() => {});
      r.writtenClipboard = await page.evaluate(() => navigator.clipboard.readText().catch(e => 'read failed: ' + e.name));
      await shot('written-submitted');
      await page.click('#next');
      r.summary = await page.textContent('#summary-title');

      r.errors = errors;
      for (const [k, v] of Object.entries(r)) if (k.startsWith('layout-') && (v.hScroll || v.small.length)) problems.push(`${name} ${k}: hScroll=${v.hScroll} small=${v.small.join('; ')}`);
      if (errors.length) problems.push(`${name} console: ${errors.join(' | ')}`);
      await context.close();
    }
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'All new-type checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
```

## paper.cjs

Mock papers and the other features added with them, over `file://` and HTTP at 375×667 and 1280×800. It needs `nlp-new-questions` and `nlp-label-diagrams` in `data/subjects.json`; until the content author adds them, run it on a scratch copy with the two ids appended to NLP's `sets` and `node tools/build-data.cjs` rerun there.

It checks:
- Setup: "Everything in NLP" at the top of Quiz set with the past paper still the default; lecture chips L5–L8 stay chosen after a reload (`quizy-lectures-v1-nlp`).
- Practise by style: Everything in NLP + L7 + "Label the diagram" counts every L7 labelling question; "Label the diagram" alone gives a round of only `label` questions with the rows in number order, the diagram edge to edge at 375px, partial marks with "Answer: …" under wrong rows, and no "Copy for Claude".
- Mock papers for L5–L8: four generated papers differ; a paper's sections add up to exactly 30 and 20; the section bar, "Finish Section A ↗", the interlude (score, "On to theory →", tabs locked), Section B's bar, the summary (total, paper code and lectures, seen / new line, the missed list), "Retry the ones I missed" (a normal round of exactly those) and tapping one missed question to redo it.
- "Replay paper code" (Enter) gives the same questions, order and option orders; a bad code and a selection that can't be filled show messages ("Not enough quiz questions in L1 only: pick more lectures."), as does DVE (no theory questions).
- No sideways scroll, tap targets ≥ 48px (chips and inputs included) and no console errors.

It writes full-page screenshots of each state for a visual check.

```js
// node paper.cjs <repoDir with the new NLP sets registered> <outDir>
// Mock papers, practise-by-style, "Everything in NLP", lecture chips and the label type, end to end
// over file:// and HTTP at 375x667 and 1280x800.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const repo = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const serve = () => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    const file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  server.listen(0, () => resolve(server));
});
const ready = page => page.waitForSelector('.subject-tab[aria-pressed=true]', {state: 'attached'});
const settle = page => page.evaluate(async () => {
  let last = -1, same = 0;
  for (let i = 0; i < 100 && same < 6; i++) { await new Promise(r => setTimeout(r, 50)); if (scrollY === last) same++; else { same = 0; last = scrollY; } }
});
const layout = page => page.evaluate(() => {
  const doc = document.documentElement;
  const small = [];
  for (const node of document.querySelectorAll('button, select, .choice, input, textarea, .rubric-point, .chip')) {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || node.closest('[hidden]') || getComputedStyle(node).opacity === '0') continue;
    const target = node.matches('input[type=checkbox]') ? node.closest('label').getBoundingClientRect() : box;
    if (target.height < 47.5) small.push(`${node.tagName}#${node.id}.${node.className} ${target.height}`);
  }
  return {hScroll: doc.scrollWidth > doc.clientWidth, small};
});

// Answers the current question in the page. mode: 'right', 'wrong' or 'half' (some parts right).
const answerHelper = () => {
  window.__answer = function (mode) {
    const item = Quizy.currentItem();
    const q = item.q;
    const box = document.getElementById('choices');
    const right = mode === 'right';
    const fire = (node, type) => node.dispatchEvent(new Event(type, {bubbles: true}));
    const check = () => document.getElementById('check').click();
    switch (q.type) {
      case 'single': case 'truefalse':
        [...box.children].find(b => q.answer.includes(Number(b.dataset.original)) === right).click(); break;
      case 'multi':
        for (const input of box.querySelectorAll('input')) if (q.answer.includes(Number(input.value)) === right || mode === 'wrong') { input.checked = true; fire(input, 'change'); }
        check(); break;
      case 'match': case 'label': {
        const list = q.type === 'match' ? q.pairs : q.labels;
        [...box.children].forEach((row, i) => {
          const want = list[Number(row.dataset.original)].answer;
          const ok = right || (mode === 'half' && i === 0);
          const select = row.querySelector('select');
          select.value = [...select.options].find(o => o.value !== '' && (q.options[Number(o.value)] === want) === ok).value;
          fire(select, 'change');
        });
        check(); break;
      }
      case 'short': {
        const input = box.querySelector('input');
        input.value = right ? q.accept[0] : 'zzz'; fire(input, 'input'); check(); break;
      }
      case 'numeric':
        box.querySelectorAll('input').forEach((input, i) => { input.value = right || (mode === 'half' && i === 0) ? String(q.parts[i].answer) : '12345'; fire(input, 'input'); });
        check(); break;
      case 'written': {
        box.querySelector('textarea').value = 'An answer.'; fire(box.querySelector('textarea'), 'input');
        check();
        const ticks = [...box.querySelectorAll('.rubric input')];
        ticks.forEach((t, i) => { if (right || (mode === 'half' && i === 0)) t.click(); });
        box.querySelector('.rubric-submit').click(); break;
      }
      default: throw new Error('unknown type ' + q.type);
    }
    return {id: q.id, type: q.type, section: item.section, score: item.score, verdict: document.querySelector('#feedback .verdict')?.innerText};
  };
};

(async () => {
  const server = await serve();
  const fileUrl = 'file:///' + path.join(repo, 'index.html').replace(/\\/g, '/');
  const httpUrl = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch({channel: 'msedge'});
  const problems = [];
  const report = {};
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  for (const [mode, url] of [['file', fileUrl], ['http', httpUrl]]) {
    for (const [w, h] of [[375, 667], [1280, 800]]) {
      const name = `${mode}-${w}`;
      const context = await browser.newContext({viewport: {width: w, height: h}, deviceScaleFactor: 1});
      const page = await context.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      const r = report[name] = {};
      const shot = async (tag, full = true) => {
        await settle(page);
        await page.waitForFunction(() => [...document.images].every(img => img.complete));
        await page.screenshot({path: path.join(out, `${name}-${tag}.png`), fullPage: full});
        const l = await layout(page);
        if (l.hScroll || l.small.length) problems.push(`${name} ${tag}: hScroll=${l.hScroll} small=${l.small.join('; ')}`);
      };
      const text = sel => page.evaluate(s => { const n = document.querySelector(s); return n && !n.closest('[hidden]') ? n.innerText : null; }, sel);

      await page.goto(url); await ready(page);
      await page.evaluate(answerHelper);
      await page.click('.subject-tab[data-key=nlp]');
      r.sets = await page.$$eval('#set option', os => os.map(o => o.value + '|' + o.text));
      r.setValue = await page.inputValue('#set');
      r.chips = await page.$$eval('#lectures .chip', cs => cs.map(c => c.textContent + (c.classList.contains('none') ? '(none)' : '') + (c.getAttribute('aria-pressed') === 'true' ? '*' : '')));
      r.styles = await page.$$eval('#style option', os => os.map(o => o.value));
      await shot('setup-nlp');
      expect(r.sets[0] === 'all|Everything in NLP' && r.setValue === 'nlp-past-quiz-2-2025', `${name} sets ${r.sets}`);

      // Lecture chips L5–L8, remembered after a reload.
      await page.click('#lectures .chip[data-lecture="5"]');
      for (const l of ['6', '7', '8']) await page.click(`#lectures .chip[data-lecture="${l}"]`);
      r.chipsAfter = await page.$$eval('#lectures .chip[aria-pressed=true]', cs => cs.map(c => c.textContent));
      r.storedLectures = await page.evaluate(() => localStorage.getItem('quizy-lectures-v1-nlp'));
      await page.reload(); await ready(page);
      await page.evaluate(answerHelper);
      r.chipsReloaded = await page.$$eval('#lectures .chip[aria-pressed=true]', cs => cs.map(c => c.textContent));
      expect(r.chipsReloaded.join() === 'L5,L6,L7,L8' && r.storedLectures === '["5","6","7","8"]', `${name} chips ${r.chipsReloaded} ${r.storedLectures}`);

      // Everything in NLP + L7 + Label the diagram = every L7 labelling question.
      await page.selectOption('#set', 'all');
      await page.click('#lectures .chip[data-lecture="all"]');
      await page.click('#lectures .chip[data-lecture="7"]');
      r.stylesAllL7 = await page.$$eval('#style option', os => os.map(o => o.text));
      await page.selectOption('#style', 'label');
      r.noteLabelL7 = await page.textContent('#bank-note');
      const expectL7 = await page.evaluate(() => Quizy.state.sets.flatMap(s => s.questions).filter(q => q.lecture === 7 && q.type === 'label').length);
      expect(r.noteLabelL7.startsWith(`${expectL7} question`), `${name} label L7 note ${r.noteLabelL7} want ${expectL7}`);
      await shot('setup-all-l7-label');
      // Practise a single style: Label the diagram, all lectures.
      await page.click('#lectures .chip[data-lecture="all"]');
      await page.selectOption('#style', 'label');
      r.noteLabel = await page.textContent('#bank-note');
      await page.click('#start');
      await settle(page);
      const labelCount = await page.evaluate(() => Quizy.state.round.length);
      r.labelRound = await page.evaluate(() => Quizy.state.round.every(i => i.q.type === 'label'));
      r.labelFigure = await page.evaluate(() => { const f = document.getElementById('figure'); const img = document.getElementById('figure-img'); const p = document.getElementById('quiz').getBoundingClientRect(); const b = img.getBoundingClientRect(); return {wide: f.classList.contains('wide'), imgW: Math.round(b.width), panelW: Math.round(p.width), left: Math.round(b.left - p.left)}; });
      r.labelRows = await page.$$eval('#choices .label-row', rows => rows.map(row => row.querySelector('.label-number').textContent));
      r.labelCheckDisabled = await page.isDisabled('#check');
      expect(r.labelRound && labelCount === 14, `${name} label round ${labelCount}`);
      expect(r.labelRows.join() === r.labelRows.map((_, i) => i + 1).join(), `${name} label rows in order ${r.labelRows}`);
      if (w === 375) expect(r.labelFigure.wide && r.labelFigure.left <= 2 && r.labelFigure.imgW >= r.labelFigure.panelW - 4, `${name} label figure ${JSON.stringify(r.labelFigure)}`);
      await shot('label-question');
      r.labelHalf = await page.evaluate(() => window.__answer('half'));
      r.labelAnswers = await page.$$eval('.label-answer', ns => ns.length);
      expect(r.labelHalf.verdict.startsWith('Partly right.') && r.labelAnswers === r.labelRows.length - 1, `${name} label half ${JSON.stringify(r.labelHalf)}`);
      expect(await page.evaluate(() => document.getElementById('ask').hidden), `${name} label: no Copy for Claude`);
      await shot('label-answered');
      await page.click('#quit');

      // Mock paper for L5–L8.
      await page.selectOption('#set', 'nlp-past-quiz-2-2025');
      await page.selectOption('#style', 'all');
      for (const l of ['5', '6', '7', '8']) await page.click(`#lectures .chip[data-lecture="${l}"]`);
      const papers = [];
      for (let i = 0; i < 4; i++) {
        await page.click('#generate');
        papers.push(await page.evaluate(() => ({code: Quizy.state.paper.code, ids: Quizy.state.round.map(x => x.q.id), sections: Quizy.state.paper.sections.map(s => s.count)})));
        await page.click('#quit');
      }
      r.papers = papers.map(p => p.code + ':' + p.sections.join('+'));
      expect(new Set(papers.map(p => p.ids.join())).size === 4, `${name} four different papers`);
      await page.click('#generate');
      await settle(page);
      const paper = await page.evaluate(() => ({code: Quizy.state.paper.code, ids: Quizy.state.round.map(x => x.q.id), choices: Quizy.state.round.map(x => [x.choiceOrder, x.pairOrder, x.optionOrder].join('/')),
        marks: Quizy.state.paper.sections.map(s => Quizy.state.round.slice(s.start, s.start + s.count).reduce((a, x) => a + Quizy.marksOf(x.q), 0))}));
      expect(paper.marks.join() === '30,20', `${name} paper marks ${paper.marks}`);
      r.paperBar = await text('#paper-bar');
      r.position = await text('#position');
      expect(r.paperBar === `Paper ${paper.code} · Section A · Quiz (30 marks)`, `${name} paper bar ${r.paperBar}`);
      await shot('paper-q1', false);
      const answers = [];
      let interlude = null;
      for (let i = 0; i < paper.ids.length; i++) {
        const modeFor = ['right', 'half', 'wrong', 'right', 'right'][i % 5];
        answers.push(await page.evaluate(m => window.__answer(m), modeFor));
        if (answers.length === 1) await shot('paper-q1-answered');
        if (await page.evaluate(() => Quizy.currentSection().start + Quizy.currentSection().count - 1 === Quizy.state.index && Quizy.state.index < Quizy.state.round.length - 1)) {
          r.finishLabel = await page.textContent('#next');
        }
        await settle(page);
        await page.click('#next');
        if (await page.isVisible('#interlude')) {
          interlude = {title: await text('#interlude-title'), detail: await text('#interlude-detail'), code: await text('#interlude-code'), button: await text('#continue'),
            view: await page.evaluate(() => document.body.dataset.view), tabsLocked: await page.evaluate(() => [...document.querySelectorAll('.subject-tab')].every(t => t.disabled))};
          await shot('paper-interlude');
          await page.click('#continue');
          r.paperBarB = await text('#paper-bar');
          r.positionB = await text('#position');
        }
      }
      r.interlude = interlude;
      const quizScore = answers.filter(a => a.section === 'quiz').reduce((s, a) => s + a.score, 0);
      expect(interlude && interlude.title === `Section A done: ${Math.round(quizScore * 100) / 100} / 30.` && interlude.button === 'On to theory →' && interlude.view === 'quiz' && interlude.tabsLocked, `${name} interlude ${JSON.stringify(interlude)}`);
      expect(r.finishLabel === 'Finish Section A ↗', `${name} finish label ${r.finishLabel}`);
      expect(r.paperBarB === `Paper ${paper.code} · Section B · Theory (20 marks)` && /^question 1 of/i.test(r.positionB), `${name} section B bar ${r.paperBarB} ${r.positionB}`);
      r.summary = {eyebrow: await text('#summary-eyebrow'), title: await text('#summary-title'), detail: await text('#summary-detail'), scores: await text('#paper-scores'),
        origin: await text('#paper-origin'), missedTitle: await text('#missed-title'), missed: await page.$$eval('.missed-item', ns => ns.length)};
      const total = answers.reduce((s, a) => s + a.score, 0);
      r.summary.expectedTotal = Math.round(total * 100) / 100;
      expect(r.summary.title.startsWith(`${Math.round(total * 100) / 100} / 50 marks`), `${name} summary title ${r.summary.title}`);
      expect(r.summary.detail.startsWith(`Paper ${paper.code} · NLP · L5–L8.`), `${name} summary detail ${r.summary.detail}`);
      expect(/Seen questions: [\d.]+ \/ [\d.]+ marks · New questions: [\d.]+ \/ [\d.]+ marks/.test(r.summary.origin), `${name} origin ${r.summary.origin}`);
      await shot('paper-summary');
      const missedIds = await page.evaluate(() => Quizy.state.round.filter(i => !Quizy.isFull(i.score, i.q)).map(i => i.q.id).sort());
      expect(r.summary.missed === missedIds.length && missedIds.length > 0, `${name} missed ${r.summary.missed} vs ${missedIds.length}`);
      // Retry the ones I missed: a normal round with exactly those.
      await page.click('#retry-missed');
      r.retry = await page.evaluate(() => ({ids: Quizy.state.round.map(i => i.q.id).sort(), paper: Quizy.state.paper, bar: document.getElementById('paper-bar').hidden}));
      expect(r.retry.ids.join() === missedIds.join() && r.retry.paper === null && r.retry.bar, `${name} retry round`);
      for (let i = 0; i < r.retry.ids.length; i++) { await page.evaluate(() => window.__answer('right')); await page.evaluate(() => document.getElementById('next').click()); }
      await settle(page);
      r.retrySummary = [await text('#summary-eyebrow'), await text('#summary-title'), await page.isHidden('#paper-result')];
      expect(r.retrySummary[0] === 'ROUND COMPLETE' && r.retrySummary[2], `${name} retry summary ${r.retrySummary}`);
      // Redo a single missed question from the paper summary: replay the paper, finish it quickly, tap one.
      await page.click('#again');
      await page.fill('#paper-code', String(paper.code));
      await page.press('#paper-code', 'Enter');
      const replay = await page.evaluate(() => ({code: Quizy.state.paper.code, ids: Quizy.state.round.map(x => x.q.id), choices: Quizy.state.round.map(x => [x.choiceOrder, x.pairOrder, x.optionOrder].join('/'))}));
      expect(replay.code === paper.code && replay.ids.join() === paper.ids.join() && replay.choices.join() === paper.choices.join(), `${name} replay same paper`);
      for (let i = 0; i < replay.ids.length; i++) {
        await page.evaluate(() => window.__answer('wrong'));
        await page.evaluate(() => document.getElementById('next').click());
        if (await page.isVisible('#interlude')) await page.click('#continue');
      }
      await settle(page);
      r.zeroSummary = await text('#summary-title');
      expect(r.zeroSummary.startsWith('0 / 50 marks · 0%'), `${name} zero ${r.zeroSummary}`);
      const firstMissed = await page.$eval('.missed-item .missed-text', n => n.textContent);
      await page.click('.missed-item >> nth=0');
      r.redoOne = await page.evaluate(() => [Quizy.state.round.length, Quizy.state.round[0].q.question.slice(0, 40)]);
      expect(r.redoOne[0] === 1 && firstMissed.startsWith(r.redoOne[1].slice(0, 30)), `${name} redo one ${r.redoOne}`);
      await page.click('#quit');
      // Bad code, and a selection that can't be filled.
      await page.fill('#paper-code', 'abc');
      await page.click('#replay');
      r.badCode = await text('#setup-message');
      for (const l of ['5', '6', '7', '8']) await page.click(`#lectures .chip[data-lecture="${l}"]`); // back to all
      await page.click('#lectures .chip[data-lecture="1"]');
      await page.click('#generate');
      r.notEnough = await text('#setup-message');
      await shot('setup-not-enough');
      expect(r.notEnough === 'Not enough quiz questions in L1 only: pick more lectures.', `${name} not enough ${r.notEnough}`);
      expect(r.badCode?.startsWith('Type the paper’s code'), `${name} bad code ${r.badCode}`);
      // DVE: no theory questions.
      await page.click('.subject-tab[data-key=dve]');
      r.dveSets = await page.$$eval('#set option', os => os.map(o => o.value));
      await page.click('#generate');
      r.dveMessage = await text('#setup-message');
      await shot('setup-dve');
      expect(r.dveSets.join() === 'dve-lecture-bank', `${name} dve sets ${r.dveSets}`);

      r.errors = errors;
      if (errors.length) problems.push(`${name} console: ${errors.join(' | ')}`);
      console.log(name, 'papers', r.papers.join(' '), '| interlude', interlude?.title, '|', r.summary.title, '|', r.summary.origin, '| dve:', r.dveMessage);
      await context.close();
    }
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'All paper checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
```

## maths.cjs

Maths rendering (KaTeX from `vendor/katex/`) and "Browse all questions", over `file://` and HTTP at 375×667 and 1280×800, with every request outside the app blocked (so it also proves the app and the KaTeX fonts work offline). It needs the fixture set `tests/maths-check.json` (`nlp-maths-check`: maths in the description and in every field of every question type, including a display matrix too wide for a phone). Run it on a scratch copy of the repo: copy `tests/maths-check.json` to `data/nlp/maths-check.json`, append `"nlp-maths-check"` to NLP's `sets` in `data/subjects.json` and run `node tools/build-data.cjs` there. Never add the fixture to the real `data/`.

It checks:
- Maths: the set description, question text (inline and display), choices, hints, numeric labels and units, the worked solution, the study note, `optionsNote`, `keyDispute`, the written model answer and rubric all contain KaTeX output; `<select>` options of match and label show plain text (`R^(n × n)`, `√dₖ scaling`) with no `$`; the wide matrix scrolls inside its own box at 375px; no raw LaTeX is shown.
- Fonts: every `.woff2` request is to `vendor/katex/fonts/` and succeeds, `KaTeX_Main` is loaded, and nothing outside the app was requested.
- Browse: 179 questions in 40-card chunks ("Show more"), search "attention matrix" (terms highlighted), Written / theory + L7 (every card is a written L7 question), open the maths written question (`#q=mx-written` in the URL, model answer, rubric, unofficial study note), "Copy for Claude", "Practise this question" (a one-question round), then "Back to browse ↗" on the summary returns to the list with the search, style, chip, count and scroll position intact and the card showing the last result. "End round" from a practised question also goes back to browse. The subject switcher stays enabled and switching shows DVE's 421 questions.
- Deep link: opening `index.html#q=mx-numeric` shows that question's answer (parts and worked solution).
- Fallback: with `katex.min.js` blocked, the maths shows as LaTeX source in `<code>` and there are no page errors.
- No sideways scroll, tap targets ≥ 48px and no console errors or warnings in every state.

It writes full-page screenshots of each question, the browse list, the answer view, the deep link and the fallback at 375px for a visual check. Playwright scrolls an element into view before clicking it, so the script opens the answer with a DOM click to compare the list's scroll position fairly.

```js
// Maths rendering and "Browse all questions": node maths.cjs <repo-with-nlp-maths-check> <outDir>
// The repo copy must register the nlp-maths-check set (maths in every field). Over file:// and HTTP,
// at 375x667 and 1280x800, with every request outside the app blocked (offline):
// plays the maths set (every type), checks KaTeX output, fonts from vendor/, no sideways scroll, tap targets,
// then browses (search, filters, answer view, practise, back with filters intact, show more, subject switch,
// deep link, Copy for Claude) and finally checks the raw-LaTeX fallback when KaTeX is blocked.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright-core');

const repo = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive: true});
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(repo) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
      res.end(fs.readFileSync(file));
    });
    server.listen(0, () => resolve(server));
  });
}

const ready = page => page.waitForSelector('.subject-tab[aria-pressed=true]', {state: 'attached'});
async function settle(page) {
  await page.evaluate(async () => {
    let last = -1, same = 0;
    for (let i = 0; i < 100 && same < 6; i++) {
      await new Promise(r => setTimeout(r, 50));
      if (window.scrollY === last) same++; else { same = 0; last = window.scrollY; }
    }
  });
}
// Layout rules on the visible page: no sideways scroll, visible controls ≥ 48px tall.
async function layout(page, where, problems) {
  const r = await page.evaluate(() => {
    const small = [];
    for (const n of document.querySelectorAll('button, select, input[type=search], input[type=text], .browse-wrong, .choice, .rubric-point')) {
      const b = n.getBoundingClientRect();
      if (b.width && b.height && getComputedStyle(n).visibility !== 'hidden' && b.height < 47.5) small.push(`${n.tagName}#${n.id}.${n.className} ${b.height.toFixed(1)}`);
    }
    return {sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, small};
  });
  if (r.sideways > 0) problems.push(`${where}: page scrolls sideways by ${r.sideways}px`);
  for (const s of r.small) problems.push(`${where}: small tap target ${s}`);
}

// Answers whatever question is shown (first option / every select's first option / typed values), then grades it.
async function answer(page) {
  const kind = await page.evaluate(() => {
    const c = document.getElementById('choices');
    if (c.querySelector('button.choice')) return 'tap';
    if (c.querySelector('input[type=checkbox]')) return 'multi';
    if (c.querySelector('select')) return 'select';
    if (c.querySelector('textarea')) return 'written';
    if (c.querySelector('.numeric-input')) return 'numeric';
    return 'short';
  });
  if (kind === 'tap') await page.click('#choices button.choice');
  if (kind === 'multi') { await page.click('#choices label.choice'); await page.click('#check'); }
  if (kind === 'select') {
    for (const s of await page.$$('#choices select')) await s.selectOption({index: 1});
    await page.click('#check');
  }
  if (kind === 'numeric') {
    const inputs = await page.$$('#choices .numeric-input');
    for (const [i, input] of inputs.entries()) await input.fill(['0.67', '0.5'][i] || '1');
    await page.click('#check');
  }
  if (kind === 'short') { await page.fill('#choices input', 'softmax'); await page.click('#check'); }
  if (kind === 'written') {
    await page.fill('#choices textarea', 'Row i attends to j.');
    await page.click('#check');
    await page.click('#choices .rubric-point');
    await page.click('#choices .rubric-submit');
  }
  await page.waitForSelector('#next:not([hidden])');
  return kind;
}

async function run(browser, base, label, viewport) {
  const problems = [];
  const context = await browser.newContext({viewport});
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const external = [];
  const fonts = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return route.continue();
    external.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('requestfinished', async req => { if (req.url().endsWith('.woff2')) fonts.push([req.url(), (await req.response())?.status() ?? 'file']); });
  page.on('requestfailed', req => { if (req.url().endsWith('.woff2')) fonts.push([req.url(), 'FAILED']); });
  const small = viewport.width < 500;

  await page.goto(base + 'index.html');
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + 'index.html');
  await ready(page);
  await page.click('.subject-tab[data-key=nlp]');

  // 1. Play the maths set: every type, maths in every field.
  await page.selectOption('#set', 'nlp-maths-check');
  assert.ok(await page.$eval('#set-description', n => !!n.querySelector('.katex') && n.textContent.includes('$5')), 'description maths');
  await page.click('#start');
  const seen = {};
  for (let i = 0; i < 8; i++) {
    await settle(page);
    const before = await page.evaluate(() => ({
      text: document.getElementById('question').textContent.slice(0, 40),
      katex: document.querySelectorAll('#question .katex').length,
      display: document.querySelectorAll('#question .math-display').length,
      hints: document.querySelectorAll('#hints .katex').length,
      choices: document.querySelectorAll('#choices .katex').length,
      options: [...document.querySelectorAll('#choices option')].map(o => o.textContent)
    }));
    await layout(page, `${label} q${i + 1} before`, problems);
    const kind = await answer(page);
    await settle(page);
    const after = await page.evaluate(() => ({
      feedbackKatex: document.querySelectorAll('#feedback .katex, #choices .katex').length,
      raw: document.querySelectorAll('.math-raw').length,
      wide: [...document.querySelectorAll('.math-display')].filter(n => n.scrollWidth > n.clientWidth + 1).length
    }));
    await layout(page, `${label} q${i + 1} after`, problems);
    seen[before.text] = {kind, ...before, ...after};
    if (small) await page.screenshot({path: path.join(out, `${label}-q${i + 1}-${kind}.png`), fullPage: true});
    if (after.raw) problems.push(`${label}: raw LaTeX shown on "${before.text}"`);
    await page.click('#next');
  }
  await page.waitForSelector('#summary:not([hidden])');
  const byStart = start => Object.values(seen).find(s => s.text.startsWith(start));
  const single = byStart('In scaled');
  assert.ok(single.katex >= 2 && single.display === 1 && single.choices >= 4 && single.feedbackKatex >= 6, `single ${JSON.stringify(single)}`);
  const numeric = byStart('With');
  assert.ok(numeric.hints >= 1 && numeric.feedbackKatex >= 5, `numeric ${JSON.stringify(numeric)}`);
  if (small) assert.ok(numeric.wide >= 1, 'the wide matrix scrolls inside its own box');
  const match = byStart('Match');
  assert.ok(match.options.every(o => !o.includes('$')) && match.options.some(o => o.includes('R^(n × n)')), `match options ${match.options}`);
  const labelQ = byStart('Label');
  assert.ok(labelQ.options.includes('√dₖ scaling'), `label options ${labelQ.options}`);
  assert.equal(byStart('Explain').kind, 'written');

  // KaTeX fonts: all from vendor/katex/fonts, all loaded, nothing fetched from outside.
  assert.ok(fonts.length > 0, 'KaTeX fonts requested');
  for (const [url, status] of fonts) {
    assert.ok(url.includes('/vendor/katex/fonts/'), url);
    assert.ok(status === 200 || status === 'file' || status === 0, `${url} ${status}`);
  }
  assert.ok(await page.evaluate(() => document.fonts.check('16px KaTeX_Main')), 'KaTeX_Main loaded');
  assert.deepEqual(external, []);

  // 2. Browse: search, written + L7, open an answer, practise it, come back with filters intact.
  await page.click('#again');
  await page.click('#browse-open');
  await page.waitForSelector('#browse:not([hidden])');
  const total = await page.textContent('#browse-count');
  assert.match(total, /^179 of 179 questions$/);
  assert.equal(await page.$$eval('#browse-list > li', l => l.length), 40);
  await page.click('#browse-more');
  assert.equal(await page.$$eval('#browse-list > li', l => l.length), 80);
  await layout(page, `${label} browse`, problems);
  if (small) await page.screenshot({path: path.join(out, `${label}-browse.png`)});
  await page.fill('#browse-search', 'attention matrix');
  await page.waitForTimeout(400);
  const searched = await page.textContent('#browse-count');
  assert.ok(await page.$$eval('.browse-text mark', m => m.length) > 0, 'search terms highlighted');
  await page.selectOption('#browse-style', 'written');
  await page.click('#browse-lectures .chip[data-lecture="7"]');
  const filtered = await page.textContent('#browse-count');
  const cards = await page.$$eval('.browse-card', cs => cs.map(c => c.textContent));
  assert.ok(cards.length > 0 && cards.every(c => c.includes('L7') && c.startsWith('Written')), `cards ${cards}`);
  await layout(page, `${label} browse filtered`, problems);
  if (small) await page.screenshot({path: path.join(out, `${label}-browse-filtered.png`), fullPage: true});
  const target = cards.findIndex(c => c.includes('self-attention matrix'));
  assert.ok(target >= 0, 'the maths written question is listed');
  await page.evaluate(() => window.scrollBy(0, 120));
  await settle(page);
  const listTop = await page.evaluate(() => window.scrollY);
  // a DOM click, so Playwright doesn't scroll the card into view first
  await page.$$eval('.browse-card', (cs, i) => cs[i].click(), target);
  await page.waitForSelector('#answer:not([hidden])');
  await settle(page);
  const answerView = await page.evaluate(() => ({
    hash: location.hash, katex: document.querySelectorAll('#answer .katex').length,
    model: document.querySelector('#answer-key .written-model')?.textContent.slice(0, 40),
    rubric: document.querySelectorAll('#answer-key .rubric-point').length,
    note: document.querySelector('#answer-notes .study-note .eyebrow')?.textContent
  }));
  assert.equal(answerView.hash, '#q=mx-written');
  assert.ok(answerView.katex >= 5 && answerView.rubric === 3 && answerView.note === 'Study note (unofficial answer)', JSON.stringify(answerView));
  await layout(page, `${label} answer`, problems);
  if (small) await page.screenshot({path: path.join(out, `${label}-answer.png`), fullPage: true});
  await page.click('#answer-copy');
  await page.waitForFunction(() => /Copied|Couldn/.test(document.getElementById('answer-copy').textContent));
  const copied = await page.textContent('#answer-copy');
  if (copied.startsWith('Copied') && base.startsWith('http')) {
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (clip) assert.ok(clip.includes('Please explain') && clip.includes('$A_{ij}$') && clip.includes('Model answer:'), clip.slice(0, 200));
  }
  await page.click('#answer-practise');
  await page.waitForSelector('#quiz:not([hidden])');
  assert.equal(await page.textContent('#position'), 'Question 1 of 1');
  assert.equal(await page.evaluate(() => location.hash), '');
  await answer(page);
  await settle(page);
  await page.click('#next');
  await page.waitForSelector('#summary:not([hidden])');
  assert.ok(await page.isVisible('#to-browse') && !(await page.isVisible('#again')), 'summary offers Back to browse');
  await settle(page);
  await page.click('#to-browse');
  await page.waitForSelector('#browse:not([hidden])');
  await page.waitForTimeout(100);
  const back = await page.evaluate(() => ({
    search: document.getElementById('browse-search').value, style: document.getElementById('browse-style').value,
    chip: document.querySelector('#browse-lectures .chip[data-lecture="7"]').getAttribute('aria-pressed'),
    count: document.getElementById('browse-count').textContent, top: window.scrollY,
    result: [...document.querySelectorAll('.browse-card')].find(c => c.textContent.includes('self-attention matrix'))?.querySelector('.browse-result')?.textContent
  }));
  assert.deepEqual([back.search, back.style, back.chip, back.count], ['attention matrix', 'written', 'true', filtered]);
  assert.ok(Math.abs(back.top - listTop) <= 1, `scroll restored ${back.top} vs ${listTop}`);
  assert.ok(back.result, 'last result shown on the card');
  // End round from a practised question also comes back to browse.
  await (await page.$$('.browse-card'))[0].click();
  await page.click('#answer-practise');
  await page.click('#quit');
  await page.waitForSelector('#browse:not([hidden])');
  // The subject switcher stays enabled while browsing and shows the other subject's bank.
  assert.equal(await page.isDisabled('.subject-tab[data-key=dve]'), false);
  await page.click('.subject-tab[data-key=dve]');
  await page.waitForSelector('#browse:not([hidden])');
  assert.equal(await page.textContent('#browse-count'), '421 of 421 questions');
  await page.click('#browse-close');
  await page.waitForSelector('#setup:not([hidden])');

  // 3. Deep link.
  await page.goto(base + 'index.html#q=mx-numeric');
  await ready(page);
  await page.waitForSelector('#answer:not([hidden])');
  assert.ok((await page.textContent('#answer-question')).startsWith('With'));
  assert.ok(await page.$$eval('#answer-key .answer-rows dd', d => d.length) === 2);
  if (small) await page.screenshot({path: path.join(out, `${label}-deeplink.png`), fullPage: true});
  await layout(page, `${label} deep link`, problems);

  const consoleErrors = errors.filter(e => !/Failed to load resource/.test(e) || true);
  await context.close();
  return {problems, errors: consoleErrors, searched, filtered, fonts: fonts.length};
}

// KaTeX blocked: maths shows as LaTeX code, no page errors.
async function fallback(browser, base) {
  const context = await browser.newContext({viewport: {width: 375, height: 667}});
  await context.route('**/katex.min.js', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'index.html#q=mx-single');
  await ready(page);
  await page.waitForSelector('#answer:not([hidden])');
  const raw = await page.$$eval('#answer .math-raw', n => n.map(x => x.textContent));
  await page.screenshot({path: path.join(out, 'fallback.png'), fullPage: true});
  await context.close();
  assert.ok(raw.includes('$\\sqrt{d_k}$') && raw.some(r => r.startsWith('$$')), raw.join(' | '));
  assert.deepEqual(errors, []);
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({channel: 'msedge'});
  const bases = {file: 'file:///' + repo.replace(/\\/g, '/') + '/', http: `http://localhost:${server.address().port}/`};
  let failed = false;
  for (const [mode, base] of Object.entries(bases)) {
    for (const viewport of [{width: 375, height: 667}, {width: 1280, height: 800}]) {
      const label = `${mode}-${viewport.width}`;
      try {
        const r = await run(browser, base, label, viewport);
        console.log(label, '|', r.searched, '|', r.filtered, '| fonts', r.fonts, '| problems', r.problems.length, '| console', r.errors.length);
        for (const p of [...r.problems, ...r.errors]) console.log('  ', p);
        if (r.problems.length || r.errors.length) failed = true;
      } catch (e) { failed = true; console.log(label, 'FAILED', e.stack); }
    }
    try { await fallback(browser, base); console.log(mode, 'fallback ok'); } catch (e) { failed = true; console.log(mode, 'fallback FAILED', e.message); }
  }
  await browser.close();
  server.close();
  console.log(failed ? 'Some maths/browse checks FAILED.' : 'All maths/browse checks passed.');
  process.exitCode = failed ? 1 : 0;
})();
```
