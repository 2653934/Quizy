// node --test "tests/*.test.cjs"
// The mock-paper generator (src/core/paper.js): exact section totals, the seen share, no repeated
// questions or variantOf groups, the same code giving the same paper, and the data field checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Quizy = require('./load.cjs');

const root = path.join(__dirname, '..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hundredths = n => Math.round(n * 100);
const sum = items => items.reduce((total, x) => total + hundredths(Quizy.marksOf(x.q)), 0);
const ids = paper => paper.sections.map(s => s.items.map(x => x.q.id));

// A made-up subject with plenty of seen and new questions in lectures 1–6.
function syntheticSets() {
  const q = (id, lecture, type, marks, extra = {}) => ({id, lecture, type, marks, question: id, concept: 'c', ...extra});
  const seen = {id: 'x-past', kind: 'past-paper', questions: []};
  const fresh = {id: 'x-new', kind: 'generated', questions: []};
  const tutorialLike = {id: 'x-extra', kind: 'generated', origin: 'seen', questions: []};
  for (let l = 1; l <= 6; l++) {
    for (let i = 0; i < 6; i++) seen.questions.push(q(`s${l}-${i}`, l, 'single', 1, i === 0 ? {variantOf: `g${l}`} : {}));
    seen.questions.push(q(`s${l}-m1`, l, 'multi', 2), q(`s${l}-m2`, l, 'multi', 2));
    seen.questions.push(q(`s${l}-w3`, l, 'written', 3, {variantOf: `w${l}`}), q(`s${l}-w4`, l, 'written', 4), q(`s${l}-n5`, l, 'numeric', 5));
    for (let i = 0; i < 5; i++) fresh.questions.push(q(`n${l}-${i}`, l, 'truefalse', 1, i === 0 ? {variantOf: `g${l}`} : {}));
    fresh.questions.push(q(`n${l}-h1`, l, 'short', 0.5), q(`n${l}-h2`, l, 'match', 0.5), q(`n${l}-lab`, l, 'label', 3));
    fresh.questions.push(q(`n${l}-w2`, l, 'written', 2), q(`n${l}-w3`, l, 'written', 3, {variantOf: `w${l}`}), q(`n${l}-w15`, l, 'written', 1.5), q(`n${l}-w05`, l, 'written', 0.5));
    fresh.questions.push(q(`n${l}-sec`, l, 'single', 2, {section: 'theory'}));
    tutorialLike.questions.push(q(`t${l}-num`, l, 'numeric', 1, {section: 'quiz'}));
  }
  return [seen, fresh, tutorialLike];
}

// Everything that must hold for any paper that was made.
function checkPaper(paper, lectures) {
  assert.equal(paper.ok, true);
  const [quiz, theory] = paper.sections;
  assert.deepEqual([quiz.key, quiz.letter, quiz.marks, theory.key, theory.letter, theory.marks], ['quiz', 'A', 30, 'theory', 'B', 20]);
  assert.equal(sum(quiz.items), 3000);
  assert.equal(sum(theory.items), 2000);
  const all = paper.sections.flatMap(s => s.items);
  assert.equal(new Set(all.map(x => x.q.id)).size, all.length, 'no question twice');
  const groups = all.map(x => x.q.variantOf).filter(Boolean);
  assert.equal(new Set(groups).size, groups.length, 'one question per variantOf group');
  for (const section of paper.sections) {
    for (const x of section.items) {
      assert.equal(Quizy.sectionOf(x.q), section.key, x.q.id);
      if (lectures.length) assert.ok(lectures.includes(String(x.q.lecture)), x.q.id);
    }
    assert.equal(hundredths(section.seenMarks), sum(section.items.filter(x => Quizy.originOf(x.set) === 'seen')));
  }
  assert.ok(paper.share >= 0.6 && paper.share <= 0.8);
}
const inBand = section => section.seenMarks >= 0.6 * section.marks - 1e-9 && section.seenMarks <= 0.8 * section.marks + 1e-9;

test('origin, section and lecture labels', () => {
  for (const kind of ['past-paper', 'practice-quiz', 'tutorial']) assert.equal(Quizy.originOf({kind}), 'seen');
  for (const kind of ['generated', 'lecture-bank']) assert.equal(Quizy.originOf({kind}), 'new');
  assert.equal(Quizy.originOf({kind: 'past-paper', origin: 'new'}), 'new');
  assert.equal(Quizy.originOf({kind: 'generated', origin: 'seen'}), 'seen');
  for (const type of ['single', 'truefalse', 'multi', 'match', 'short', 'label']) assert.equal(Quizy.sectionOf({type}), 'quiz', type);
  for (const type of ['written', 'numeric']) assert.equal(Quizy.sectionOf({type}), 'theory', type);
  assert.equal(Quizy.sectionOf({type: 'single', section: 'theory'}), 'theory');
  assert.equal(Quizy.sectionOf({type: 'written', section: 'quiz'}), 'quiz');
  assert.equal(Quizy.lectureLabel([]), 'all lectures');
  assert.equal(Quizy.lectureLabel(null), 'all lectures');
  assert.equal(Quizy.lectureLabel(['5']), 'L5');
  assert.equal(Quizy.lectureLabel(['8', '5', '6', '7']), 'L5–L8');
  assert.equal(Quizy.lectureLabel([5, 6, 8, 10, 11]), 'L5–L6, L8, L10–L11');
  assert.equal(Quizy.lectureLabel(['5', '7']), 'L5, L7');
});

test('paper field checks', () => {
  const errors = set => { const list = []; Quizy.checkPaperFields(set, m => list.push(m)); return list; };
  const q = {id: 'q', type: 'single'};
  assert.deepEqual(errors({id: 's', questions: [q, {...q, section: 'quiz', variantOf: 'g1'}, {...q, section: 'theory'}]}), []);
  assert.deepEqual(errors({id: 's', origin: 'seen', questions: []}), []);
  assert.deepEqual(errors({id: 's', origin: 'old', questions: []}), ['s: origin must be "seen" or "new"']);
  assert.deepEqual(errors({id: 's', questions: [{...q, section: 'Quiz'}]}), ['s / q: section must be "quiz" or "theory"']);
  for (const variantOf of ['', '  ', 3, null]) assert.deepEqual(errors({id: 's', questions: [{...q, variantOf}]}), ['s / q: variantOf must be a non-empty string'], String(variantOf));
});

test('synthetic subject: exact totals, seen share and no repeats for many codes and lecture choices', () => {
  const sets = syntheticSets();
  const choices = [[], ['1', '2', '3'], ['3', '4', '5', '6'], ['2', '5', '6'], ['1', '2', '3', '4', '5', '6']];
  let papers = 0;
  for (const lectures of choices) {
    for (let code = 1000; code < 1150; code++) {
      const paper = Quizy.makePaper({sets, lectures, code});
      checkPaper(paper, lectures);
      // Here every seen target in the band can be hit exactly.
      for (const section of paper.sections) assert.equal(section.seenMarks, Math.round(paper.share * section.marks), `${code} ${lectures} ${section.key}`);
      papers++;
    }
  }
  for (const lectures of [['1', '2'], ['4', '6']]) {
    for (let code = 1; code < 150; code++) {
      const paper = Quizy.makePaper({sets, lectures, code});
      checkPaper(paper, lectures);
      for (const section of paper.sections) assert.ok(inBand(section), `${code} ${lectures} ${section.key} ${section.seenMarks}`);
    }
  }
  assert.ok(papers >= 750);
});

test('the same code, lectures and data give the same paper; other codes differ', () => {
  const sets = syntheticSets();
  const make = code => Quizy.makePaper({sets, lectures: ['2', '3', '4'], code});
  const a = make(4821), b = make(4821);
  assert.deepEqual(ids(a), ids(b));
  assert.equal(a.share, b.share);
  // The generator returned with the paper continues identically too (used to shuffle the options).
  assert.deepEqual([a.random(), a.random()], [b.random(), b.random()]);
  const others = new Set();
  for (let code = 1000; code < 1020; code++) others.add(JSON.stringify(ids(make(code))));
  assert.ok(others.size >= 18, `only ${others.size} different papers`);
  // Lecture order in the request doesn't matter.
  assert.deepEqual(ids(Quizy.makePaper({sets, lectures: ['4', '2', '3'], code: 4821})), ids(a));
});

test('a section that cannot be filled exactly is reported', () => {
  const sets = syntheticSets();
  const one = Quizy.makePaper({sets, lectures: ['3'], code: 7});
  assert.equal(one.ok, false);
  assert.equal(one.section.key, 'quiz');
  assert.equal(one.available, 6 + 4 + 5 + 1 + 3 + 1); // seen singles + multis, new tf + halves + label, tutorial-like numeric
  // Theory short: a quiz-only subject (like the DVE lecture bank).
  const quizOnly = [{id: 'b', kind: 'lecture-bank', questions: Array.from({length: 40}, (_, i) => ({id: `b${i}`, lecture: 1, type: 'single', question: 'x'}))}];
  const r = Quizy.makePaper({sets: quizOnly, lectures: [], code: 3});
  assert.equal(r.ok, false);
  assert.equal(r.section.key, 'theory');
  assert.equal(r.available, 0);
  // Enough marks but no exact sum: theory questions of 7 marks only.
  const sevens = [...quizOnly, {id: 'c', kind: 'tutorial', questions: Array.from({length: 6}, (_, i) => ({id: `c${i}`, lecture: 1, type: 'written', marks: 7, question: 'x'}))}];
  assert.equal(Quizy.makePaper({sets: sevens, lectures: [], code: 3}).section.key, 'theory');
});

test('small random pools: exact whenever possible, inside 60–80% whenever possible (checked by brute force)', () => {
  const random = Quizy.seeded(99);
  const weights = [0.5, 1, 1, 1, 2, 2, 3, 4, 5];
  // Every (seen, new) mark split that subsets of the items can make.
  const splits = items => {
    const found = new Set();
    for (let mask = 0; mask < 1 << items.length; mask++) {
      let s = 0, n = 0;
      items.forEach((x, i) => { if (mask & (1 << i)) { if (Quizy.originOf(x.set) === 'seen') s += hundredths(x.q.marks); else n += hundredths(x.q.marks); } });
      found.add(`${s},${n}`);
    }
    return [...found].map(k => k.split(',').map(Number));
  };
  let made = 0, failed = 0;
  for (let round = 0; round < 120; round++) {
    const seen = {id: 'p', kind: 'past-paper', questions: []}, fresh = {id: 'g', kind: 'generated', questions: []};
    for (let i = 0; i < 26; i++) {
      const marks = weights[Math.floor(random() * weights.length)];
      const type = i % 2 ? 'single' : 'written';
      (random() < 0.5 ? seen : fresh).questions.push({id: `r${round}-${i}`, lecture: 1, type, marks, question: 'x'});
    }
    const sets = [seen, fresh];
    const paper = Quizy.makePaper({sets, lectures: [], code: round});
    for (const section of Quizy.PAPER_SECTIONS) {
      const items = sets.flatMap(set => set.questions.map(q => ({q, set}))).filter(x => Quizy.sectionOf(x.q) === section.key);
      const exact = splits(items).filter(([s, n]) => s + n === hundredths(section.marks));
      if (!exact.length) { assert.equal(paper.ok, false, `round ${round}: ${section.key} should be impossible`); failed++; break; }
      if (!paper.ok) assert.notEqual(paper.section.key, section.key, `round ${round}: ${section.key} was possible`);
      if (!paper.ok) continue;
      const made = paper.sections.find(s => s.key === section.key);
      if (exact.some(([s]) => s >= 0.6 * hundredths(section.marks) && s <= 0.8 * hundredths(section.marks))) assert.ok(inBand(made), `round ${round}: ${section.key} could be in band`);
    }
    if (paper.ok) { checkPaper(paper, []); made++; }
  }
  assert.ok(made > 20 && failed > 5, `made ${made}, failed ${failed}`);
});

test('real data: papers from the registered sets', () => {
  const subjects = readJSON('data/subjects.json').subjects;
  const setsOf = key => subjects.find(s => s.key === key).sets.map(id => readJSON(Quizy.setFile(key, id)));
  const nlp = setsOf('nlp');
  for (const lectures of [['5', '6', '7', '8'], []]) {
    for (let code = 1000; code < 1040; code++) checkPaper(Quizy.makePaper({sets: nlp, lectures, code}), lectures);
  }
  // NLP lecture 1 alone has too few quiz marks; the DVE lecture bank has no theory questions.
  const l1 = Quizy.makePaper({sets: nlp, lectures: ['1'], code: 1});
  assert.deepEqual([l1.ok, l1.section.key], [false, 'quiz']);
  const dve = Quizy.makePaper({sets: setsOf('dve'), lectures: [], code: 1});
  assert.deepEqual([dve.ok, dve.section.key], [false, 'theory']);
});
