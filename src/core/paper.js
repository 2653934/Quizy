'use strict';

// The mock-paper generator ("Generate a mock test"). Pure and Node-safe.
// A paper is a Quiz section (30 marks) then a Theory section (20 marks), drawn from every set of a subject
// for the chosen lectures. Each paper has a code that seeds its own generator, so the same code, lectures
// and data always give the same paper.
//
// Seen vs new: sets of kind past-paper / practice-quiz / tutorial are "seen" (the lecturer's own questions),
// the rest "new"; a set's optional "origin" overrides. A paper draws a seen share f from [0.60, 0.80] and aims
// for round(f × marks) seen marks in each section, the rest new.
// Sections: written and numeric questions go to Theory, the rest to Quiz; a question's "section" overrides.
// Questions that share a "variantOf" group test the same fact: at most one of them per paper.
(function (Quizy) {
  const SEEN_KINDS = ['past-paper', 'practice-quiz', 'tutorial'];
  const THEORY_TYPES = ['written', 'numeric'];
  const SHARE = [0.6, 0.8];
  const ATTEMPTS = 200;        // fresh picks of one question per variantOf group
  const OUT_OF_BAND = 1e6;     // cost added when the seen share falls outside SHARE

  Quizy.PAPER_SECTIONS = [
    {key: 'quiz', letter: 'A', name: 'Quiz', marks: 30},
    {key: 'theory', letter: 'B', name: 'Theory', marks: 20}
  ];

  Quizy.originOf = set => set.origin || (SEEN_KINDS.includes(set.kind) ? 'seen' : 'new');
  Quizy.sectionOf = q => q.section || (THEORY_TYPES.includes(q.type) ? 'theory' : 'quiz');

  // Build checks for the optional paper fields (tools/build-data.cjs).
  Quizy.checkPaperFields = function (set, fail) {
    if (set.origin !== undefined && !['seen', 'new'].includes(set.origin)) fail(`${set.id}: origin must be "seen" or "new"`);
    for (const q of set.questions || []) {
      const at = `${set.id} / ${q.id}`;
      if (q.section !== undefined && !['quiz', 'theory'].includes(q.section)) fail(`${at}: section must be "quiz" or "theory"`);
      if (q.variantOf !== undefined && !(typeof q.variantOf === 'string' && q.variantOf.trim())) fail(`${at}: variantOf must be a non-empty string`);
    }
  };

  // "L5", "L5–L8", "L5–L6, L8"; an empty list means every lecture.
  Quizy.lectureLabel = function (lectures) {
    if (!lectures || !lectures.length) return 'all lectures';
    const numbers = [...new Set(lectures.map(String))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const runs = [];
    for (const n of numbers) {
      const run = runs[runs.length - 1];
      if (run && Number(n) === Number(run[1]) + 1) run[1] = n; else runs.push([n, n]);
    }
    return runs.map(([a, b]) => a === b ? `L${a}` : `L${a}–L${b}`).join(', ');
  };

  Quizy.newPaperCode = () => 1000 + Math.floor(Quizy.random() * 9000);

  // Marks are worked in hundredths so that 0.5 + 0.5 sums exactly.
  const units = marks => Math.round(marks * 100);
  const gcd = (a, b) => b ? gcd(b, a % b) : a;

  // reach[i][s]: some subset of the first i weights sums to s (s ≤ max).
  function reachTable(weights, max) {
    const reach = [new Uint8Array(max + 1)];
    reach[0][0] = 1;
    weights.forEach((w, i) => {
      const prev = reach[i], row = prev.slice();
      for (let s = w; s <= max; s++) if (prev[s - w]) row[s] = 1;
      reach.push(row);
    });
    return reach;
  }

  // A random subset of items whose weights sum to exactly sum (which reach says is possible).
  function takeExact(items, weights, reach, sum, random) {
    const picked = [];
    for (let i = items.length; i > 0; i--) {
      const w = weights[i - 1];
      const canTake = sum >= w && reach[i - 1][sum - w];
      if (canTake && (!reach[i - 1][sum] || random() < 0.5)) { picked.push(items[i - 1]); sum -= w; }
    }
    return picked;
  }

  // Fills one section exactly from seen and new candidates, as close to the seen target as possible
  // (and inside the 60–80% band when that can be done). Returns null when no exact fill exists.
  function fillSection(seen, fresh, section, share, random) {
    const total = units(section.marks);
    const target = units(Math.round(share * section.marks));
    const [lo, hi] = SHARE.map(f => f * total);
    const ws = seen.map(x => units(Quizy.marksOf(x.q)));
    const wn = fresh.map(x => units(Quizy.marksOf(x.q)));
    const g = [...ws, ...wn].reduce(gcd, total);
    const max = total / g;
    const reachSeen = reachTable(ws.map(w => w / g), max);
    const reachNew = reachTable(wn.map(w => w / g), max);
    let best = [], bestCost = Infinity;
    for (let s = 0; s <= max; s++) {
      if (!reachSeen[seen.length][s] || !reachNew[fresh.length][max - s]) continue;
      const x = s * g;
      const cost = x >= lo - 1e-6 && x <= hi + 1e-6 ? Math.abs(x - target) : OUT_OF_BAND + Math.min(Math.abs(x - lo), Math.abs(x - hi));
      if (cost < bestCost) { best = [s]; bestCost = cost; } else if (cost === bestCost) best.push(s);
    }
    if (!best.length) return null;
    const s = best[Math.floor(random() * best.length)];
    return {
      items: [...takeExact(seen, ws.map(w => w / g), reachSeen, s, random), ...takeExact(fresh, wn.map(w => w / g), reachNew, max - s, random)],
      seenMarks: s * g / 100,
      cost: bestCost
    };
  }

  // One question per variantOf group (the first in the given order), and no question twice.
  function onePerGroup(pool) {
    const groups = new Set(), ids = new Set();
    return pool.filter(({q}) => {
      if (ids.has(q.id) || (q.variantOf && groups.has(q.variantOf))) return false;
      ids.add(q.id);
      if (q.variantOf) groups.add(q.variantOf);
      return true;
    });
  }

  // sets: the subject's sets in order; lectures: lecture values to include (empty or null for all); code: the paper code.
  // Returns {ok: true, code, lectures, share, sections: [{key, letter, name, marks, items: [{q, set}], seenMarks}], random}
  // (random continues the paper's generator, for shuffling options the same way on a replay), or
  // {ok: false, code, lectures, section, available} naming the section that can't be filled exactly.
  Quizy.makePaper = function ({sets, lectures, code}) {
    const random = Quizy.seeded(code);
    const share = SHARE[0] + (SHARE[1] - SHARE[0]) * random();
    const wanted = lectures && lectures.length ? new Set(lectures.map(String)) : null;
    const pool = sets.flatMap(set => set.questions.filter(q => !wanted || wanted.has(String(q.lecture))).map(q => ({q, set})));
    const grouped = pool.some(x => x.q.variantOf);
    const failures = {};
    let best = null;
    for (let attempt = 0; attempt < (grouped ? ATTEMPTS : 1) && !(best && best.cost === 0); attempt++) {
      const picks = onePerGroup(Quizy.shuffle(pool, random));
      const sections = [];
      let cost = 0;
      for (const section of Quizy.PAPER_SECTIONS) {
        const mine = picks.filter(x => Quizy.sectionOf(x.q) === section.key);
        const filled = fillSection(mine.filter(x => Quizy.originOf(x.set) === 'seen'), mine.filter(x => Quizy.originOf(x.set) !== 'seen'), section, share, random);
        if (!filled) { failures[section.key] = (failures[section.key] || 0) + 1; break; }
        sections.push({...section, items: Quizy.shuffle(filled.items, random), seenMarks: filled.seenMarks});
        cost += filled.cost;
      }
      if (sections.length === Quizy.PAPER_SECTIONS.length && (!best || cost < best.cost)) best = {cost, sections};
    }
    const base = {code, lectures: wanted ? [...wanted] : []};
    if (best) return {ok: true, ...base, share, sections: best.sections, random};
    const section = Quizy.PAPER_SECTIONS.reduce((a, b) => (failures[b.key] || 0) > (failures[a.key] || 0) ? b : a);
    const available = pool.filter(x => Quizy.sectionOf(x.q) === section.key).reduce((sum, x) => sum + Quizy.marksOf(x.q), 0);
    return {ok: false, ...base, section, available};
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
