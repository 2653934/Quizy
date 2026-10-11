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
```

## What it does

For `file://` and a local HTTP server, at 375×667 and 1280×800:

- Screenshots the setup screen of every subject (DVE, NLP, DO's "No quizzes yet") and records its text, theme tokens, theme colour and favicon.
- Plays seeded rounds (`index.html?seed=7`, see `src/core/random.js`): NLP all correct (expected **50 / 50 marks**), NLP all wrong with every multi option ticked (expected **0 / 50 marks**), then DVE all correct (**421 out of 421 correct**) and all wrong. The same seed replays the same order, so the two rounds can be compared question by question. For every question it records the source line, question, hints and options HTML before and after answering, the feedback, the "Next" label and the stats.
- Screenshots the first answered `multi`, the first answered `match`, NLP Q20 (with the image) and the summary, both viewport-only and full page.
- At 375×667 it measures, after each question's scroll has settled, that the question text, progress bar and "End round" are on the first screen (last result: the question starts at most 301px from the top, on question 1).
- Checks that nothing scrolls sideways, that visible buttons, selects, options and checkbox rows are ≥ 48px tall, and that there are no console errors.
- Checks storage: the last subject is remembered; seeding `quizy-dve-attempts-v1` with 2 correct + 1 wrong gives 2 / 1 in the DVE stats and copies the value to `quizy-attempts-v2-dve` while keeping the old key; existing v2 data is never overwritten; broken JSON in storage is ignored.
- Checks that without `?seed` two loads give different orders (Math.random is still used).

Things to know when changing it:
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
      for (const node of document.querySelectorAll('button, select, .choice, input[type=checkbox]')) {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height || node.closest('[hidden]')) continue;
        const target = node.matches('input') ? node.closest('label').getBoundingClientRect() : box;
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
          lectures: [...document.getElementById('lecture').options].map(o => o.value + '|' + o.text)
        }));
        cfg.layout.push({where: `${key} setup`, ...(await page.evaluate(() => window.__smoke.layout()))});
      }
      // Lecture filter + review mode note text on DVE.
      await page.click('.subject-tab[data-key=dve]');
      await page.selectOption('#lecture', '3');
      r['dve-note-l3'] = await page.textContent('#bank-note');
      await page.selectOption('#mode', 'review');
      await page.click('#start');
      r['dve-review-empty'] = await page.textContent('#setup-message');
      await page.selectOption('#mode', 'all');
      r['dve-note-back'] = await page.textContent('#bank-note') + '|' + await page.textContent('#setup-message');

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
