'use strict';

// The scope-exam generator ("Generate a scope exam" and "Full scope sweep"). Pure and Node-safe.
// Only for subjects with an "examBlueprint" in subjects.json (DO): a paper shaped like the real exam,
// e.g. Question 1 (18 marks, topics 1 and 5), Question 2 (20 marks), Question 3 (12 marks), drawn from
// every set of the subject. Topics are the question's "lecture" numbers; a topic that no blueprint
// question lists (DO's "Out of scope") never appears.
//
// Each exam question is filled exactly to its marks with the subset-sum tables of src/core/paper.js
// (marks in hundredths divided by their gcd). If that can't be done it takes the nearest total under it
// and says so (short: true). The seen marks (the lecturer's sets, Quizy.originOf) of each exam question fall
// inside blueprint.seenShare (e.g. 60–80%) when possible; every split inside the band is equally good, so the
// ranking below decides. Within a paper: no question twice and at most one question per variantOf group.
// Which questions are tried first comes from a weighted random ranking: a seen question weighs as much as
// the number of seen questions in its variantOf group (how often the lecturer repeated it), a new one 1.
// The ranking is then interleaved by topic so the fill prefers covering more topics, and the fill takes the
// best-ranked questions that still allow an exact total. Of several attempts the paper keeps the first with
// exact totals, the seen share in the band and no two parts of an exam question from the same topic (or else
// the one closest to that). A paper code seeds everything (Quizy.seeded), so the
// same code, subject and data give the same paper.
(function (Quizy) {
  const ATTEMPTS = 40;     // whole-paper attempts; the best one is kept
  const OUT_OF_BAND = 1e6; // cost added when a question's seen share falls outside the band

  // The topics a blueprint covers, in order (a topic listed by two questions counts once).
  Quizy.blueprintTopics = blueprint => [...new Set(blueprint.questions.flatMap(x => x.topics.map(Number)))].sort((a, b) => a - b);

  // Build checks for subjects.json "examBlueprint" (tools/build-data.cjs).
  Quizy.checkExamBlueprint = function (subject, fail) {
    const b = subject.examBlueprint;
    if (b === undefined) return;
    const at = `${subject.key}.examBlueprint`;
    const isText = value => typeof value === 'string' && value.trim().length > 0;
    if (!b || typeof b !== 'object') return fail(`${at} must be an object`);
    if (!isText(b.title)) fail(`${at}: title must be text`);
    if (!Array.isArray(b.questions) || !b.questions.length) return fail(`${at}: questions must be a non-empty list`);
    let total = 0;
    b.questions.forEach((x, i) => {
      const where = `${at}.questions[${i}]`;
      if (!isText(x.label)) fail(`${where}: label must be text`);
      if (!(typeof x.marks === 'number' && x.marks > 0)) fail(`${where}: marks must be a positive number`);
      else total += x.marks;
      if (!Array.isArray(x.topics) || !x.topics.length) fail(`${where}: topics must be a non-empty list`);
      else for (const t of x.topics) if (!isText(subject.topics?.[String(t)])) fail(`${where}: topic ${t} has no name in ${subject.key}.topics`);
    });
    if (b.totalMarks !== total) fail(`${at}: totalMarks is ${b.totalMarks} but the questions add up to ${total}`);
    const share = b.seenShare;
    if (!(Array.isArray(share) && share.length === 2 && share.every(f => typeof f === 'number' && f >= 0 && f <= 1) && share[0] <= share[1])) {
      fail(`${at}: seenShare must be [low, high] with 0 ≤ low ≤ high ≤ 1`);
    }
  };

  // "DOPT2022", "DOEXAM2021", "Tut2", "Test 2019", "2024 Exam": the source PDF's name when it is one word,
  // otherwise the set title without its bracketed note.
  Quizy.paperName = function (set) {
    const file = (set.sourceFile || '').split(/[;(]/)[0].trim().split('/').pop().replace(/\.pdf$/i, '');
    return file && !/\s/.test(file) ? file : set.title.replace(/\s*\(.*\)\s*$/, '');
  };

  // "from DOPT2022 Q2(c)", "from April 2013 test Q3", or "new practice question" for the scope bank.
  Quizy.originLabel = function (q, set) {
    if (Quizy.originOf(set) !== 'seen') return 'new practice question';
    const number = q.source?.number ?? q.number;
    return `from ${q.source?.paper || Quizy.paperName(set)}${number !== undefined ? ` Q${number}` : ''}`;
  };

  // How often the lecturer asked a question: the number of seen questions in its variantOf group (1 without one).
  function repeatCounts(pool) {
    const counts = new Map();
    for (const x of pool) if (x.seen && x.q.variantOf) counts.set(x.q.variantOf, (counts.get(x.q.variantOf) || 0) + 1);
    return x => x.seen && x.q.variantOf ? counts.get(x.q.variantOf) : 1;
  }

  // Weighted random order without replacement (key = u^(1/w), largest first), then interleaved by topic:
  // the best of each topic, then the second best of each, and so on. The topics take turns in a random
  // order, so a topic with many questions doesn't always come first.
  function rankByWeight(items, weightOf, random) {
    const keyed = items.map(x => ({x, key: Math.pow(random(), 1 / weightOf(x))})).sort((a, b) => b.key - a.key).map(k => k.x);
    const byTopic = new Map();
    for (const x of keyed) {
      if (!byTopic.has(x.topic)) byTopic.set(x.topic, []);
      byTopic.get(x.topic).push(x);
    }
    const lists = Quizy.shuffle([...byTopic.keys()].sort((a, b) => a - b), random).map(t => byTopic.get(t));
    const ranked = [];
    for (let round = 0; ranked.length < keyed.length; round++) for (const list of lists) if (list[round]) ranked.push(list[round]);
    return ranked;
  }

  // Fills one exam question: the largest total ≤ marks that seen + new can reach exactly, with a seen part
  // inside the band (or nearest it), then the best-ranked questions for each part.
  // seen / fresh are ranked best first. Returns {items, total, seenMarks, cost} (items may be empty).
  function fillQuestion(seen, fresh, marks, band, random) {
    const {units, gcd, reachTable, takeExact} = Quizy.subsetSum;
    const full = units(marks);
    // takeExact decides from the last item down, so the best-ranked go last.
    const s = [...seen].reverse(), n = [...fresh].reverse();
    const ws = s.map(x => units(Quizy.marksOf(x.q))), wn = n.map(x => units(Quizy.marksOf(x.q)));
    const g = [...ws, ...wn].reduce(gcd, full);
    const max = Math.floor(full / g);
    const reachSeen = reachTable(ws.map(w => w / g), max), reachNew = reachTable(wn.map(w => w / g), max);
    const canSeen = reachSeen[s.length], canNew = reachNew[n.length];
    for (let total = max; total >= 0; total--) {
      const [lo, hi] = band.map(f => f * total * g);
      let best = [], bestCost = Infinity;
      for (let k = 0; k <= total; k++) {
        if (!canSeen[k] || !canNew[total - k]) continue;
        const x = k * g;
        // Any split inside the band is as good as another (only outside it does the distance count).
        const cost = x >= lo - 1e-6 && x <= hi + 1e-6 ? 0 : OUT_OF_BAND + Math.min(Math.abs(x - lo), Math.abs(x - hi));
        if (cost < bestCost) { best = [k]; bestCost = cost; } else if (cost === bestCost) best.push(k);
      }
      if (!best.length) continue;
      const k = best[Math.floor(random() * best.length)];
      return {
        items: [...takeExact(s, ws.map(w => w / g), reachSeen, k, random, true), ...takeExact(n, wn.map(w => w / g), reachNew, total - k, random, true)],
        total: total * g / 100,
        seenMarks: k * g / 100,
        cost: bestCost
      };
    }
    return {items: [], total: 0, seenMarks: 0, cost: OUT_OF_BAND};
  }

  // Everything a paper can use: the subject's questions in the blueprint's topics, with their set, topic and origin.
  function candidates(sets, topics) {
    const wanted = new Set(topics.map(String));
    return sets.flatMap(set => set.questions.filter(q => wanted.has(String(q.lecture)))
      .map(q => ({q, set, topic: Number(q.lecture), seen: Quizy.originOf(set) === 'seen'})));
  }

  const unused = (used, x) => !used.ids.has(x.q.id) && !(x.q.variantOf && used.groups.has(x.q.variantOf));
  function use(used, x) {
    used.ids.add(x.q.id);
    if (x.q.variantOf) used.groups.add(x.q.variantOf);
  }

  // Keeps the first (best-ranked) question of each variantOf group.
  function onePerGroup(ranked) {
    const groups = new Set();
    return ranked.filter(x => !x.q.variantOf || (!groups.has(x.q.variantOf) && groups.add(x.q.variantOf)));
  }

  const result = (kind, subject, code, share, questions, random) => ({
    ok: questions.every(x => x.items.length > 0), kind, code, share, random,
    title: subject.examBlueprint.title, label: kind === 'sweep' ? `S${code}` : String(code),
    totalMarks: questions.reduce((sum, x) => sum + x.total, 0),
    questions
  });

  // A scope exam: {ok, kind: 'exam', code, label, title, totalMarks, questions: [{label, marks, topics,
  // items: [{q, set}], total, seenMarks, short}], random} (random continues the paper's generator, for
  // shuffling options the same way on a replay). ok is false only when an exam question got no questions at all.
  Quizy.makeScopeExam = function ({subject, sets, code}) {
    const blueprint = subject.examBlueprint;
    const random = Quizy.seeded(code);
    const pool = candidates(sets, Quizy.blueprintTopics(blueprint));
    const weightOf = repeatCounts(pool);
    let best = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const used = {ids: new Set(), groups: new Set()};
      const questions = blueprint.questions.map(spec => {
        const mine = pool.filter(x => spec.topics.map(Number).includes(x.topic) && unused(used, x));
        const ranked = onePerGroup(rankByWeight(mine, weightOf, random));
        const filled = fillQuestion(ranked.filter(x => x.seen), ranked.filter(x => !x.seen), spec.marks, blueprint.seenShare, random);
        filled.items.forEach(x => use(used, x));
        // Sub-parts in topic order, as an exam question would run.
        const items = filled.items.sort((a, b) => a.topic - b.topic).map(({q, set}) => ({q, set}));
        return {label: spec.label, marks: spec.marks, topics: spec.topics.map(Number), items, total: filled.total, seenMarks: filled.seenMarks,
          short: filled.total < spec.marks, cost: filled.cost, repeats: filled.items.length - new Set(filled.items.map(x => x.topic)).size};
      });
      const score = [
        questions.reduce((sum, x) => sum + (x.marks - x.total), 0),
        questions.reduce((sum, x) => sum + x.cost, 0),
        questions.reduce((sum, x) => sum + x.repeats, 0)
      ];
      if (!best || score[0] < best.score[0] - 1e-9 || (Math.abs(score[0] - best.score[0]) < 1e-9
        && (score[1] < best.score[1] - 1e-9 || (Math.abs(score[1] - best.score[1]) < 1e-9 && score[2] < best.score[2])))) best = {score, questions};
      if (best.score.every(n => n === 0)) break;
    }
    return result('exam', subject, code, null, best.questions.map(({cost, repeats, ...x}) => x), random);
  };

  // A full scope sweep: at least one question from every topic of the blueprint, grouped under the first
  // blueprint question that lists the topic (any total). In each topic it takes a seen question with
  // probability f (the paper's seen share) when both kinds are there, weighted by repeats like the exam.
  Quizy.makeScopeSweep = function ({subject, sets, code}) {
    const blueprint = subject.examBlueprint;
    const random = Quizy.seeded(code);
    const [low, high] = blueprint.seenShare;
    const share = low + (high - low) * random();
    const pool = candidates(sets, Quizy.blueprintTopics(blueprint));
    const weightOf = repeatCounts(pool);
    const used = {ids: new Set(), groups: new Set()};
    const placed = new Set();
    const questions = blueprint.questions.map(spec => {
      const items = [];
      for (const topic of spec.topics.map(Number).sort((a, b) => a - b)) {
        if (placed.has(topic)) continue;
        placed.add(topic);
        const mine = pool.filter(x => x.topic === topic && unused(used, x));
        const seen = mine.filter(x => x.seen), fresh = mine.filter(x => !x.seen);
        const from = seen.length && (!fresh.length || random() < share) ? seen : fresh;
        const pick = rankByWeight(from, weightOf, random)[0];
        if (!pick) continue;
        use(used, pick);
        items.push({q: pick.q, set: pick.set});
      }
      const total = items.reduce((sum, x) => sum + Quizy.marksOf(x.q), 0);
      const seenMarks = items.filter(x => Quizy.originOf(x.set) === 'seen').reduce((sum, x) => sum + Quizy.marksOf(x.q), 0);
      return {label: spec.label, marks: total, topics: spec.topics.map(Number), items, total, seenMarks, short: false};
    }).filter(x => x.items.length);
    return result('sweep', subject, code, share, questions, random);
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
