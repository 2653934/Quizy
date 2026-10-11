// node --test "tests/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Quizy = require('./load.cjs');

const {single, truefalse, multi, match} = Quizy.types;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('marksOf defaults to 1', () => {
  assert.equal(Quizy.marksOf({}), 1);
  assert.equal(Quizy.marksOf({marks: 4}), 4);
});

test('isFull: only full marks count as correct', () => {
  const q = {marks: 2};
  assert.equal(Quizy.isFull(2, q), true);
  assert.equal(Quizy.isFull(2 - 1e-12, q), true);
  assert.equal(Quizy.isFull(1.5, q), false);
  assert.equal(Quizy.isFull(0, {}), false);
  assert.equal(Quizy.isFull(1, {}), true);
});

test('roundTotals adds scores, full answers and marks', () => {
  const items = [
    {q: {marks: 2}, score: 2},
    {q: {marks: 4}, score: 8 / 3},
    {q: {}, score: 0},
    {q: {marks: 3}}
  ];
  const totals = Quizy.roundTotals(items);
  assert.equal(totals.full, 1);
  assert.equal(totals.marks, 10);
  assert.equal(totals.count, 4);
  assert.equal(Quizy.formatMarks(totals.score), '4.67');
});

test('formatting helpers', () => {
  assert.equal(Quizy.formatMarks(2 / 3), '0.67');
  assert.equal(Quizy.formatMarks(31.5), '31.5');
  assert.equal(Quizy.plural(1, 'mark'), '1 mark');
  assert.equal(Quizy.plural(0, 'mark'), '0 marks');
  assert.equal(Quizy.letter(2), 'c.');
});

test('seeded shuffle is repeatable and a permutation', () => {
  Quizy.seedRandom(7);
  const a = Quizy.shuffle(Quizy.order(10));
  Quizy.seedRandom(7);
  const b = Quizy.shuffle(Quizy.order(10));
  Quizy.seedRandom(null);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), Quizy.order(10));
});

test('single and truefalse: full marks or 0', () => {
  const q = {choices: ['a', 'b', 'c'], answer: [2], marks: 3};
  assert.equal(single.score(q, [2]), 3);
  assert.equal(single.score(q, [0]), 0);
  const tf = {choices: ['True', 'False'], answer: [1]};
  assert.equal(truefalse.score(tf, [1]), 1);
  assert.equal(truefalse.score(tf, [0]), 0);
});

test('multi: Moodle formula marks × max(0, right/C − wrong/W)', () => {
  const oneOfFour = {choices: ['a', 'b', 'c', 'd'], answer: [0]};
  close(multi.score(oneOfFour, [0, 1]), 2 / 3); // C=1, W=3: 1 correct + 1 wrong
  close(multi.score({...oneOfFour, marks: 4}, [0, 1]), 8 / 3);
  assert.equal(Quizy.formatMarks(multi.score({...oneOfFour, marks: 4}, [0, 1])), '2.67');
  assert.equal(multi.score(oneOfFour, [0]), 1);
  assert.equal(multi.score(oneOfFour, [0, 1, 2, 3]), 0); // picking every option scores 0
  assert.equal(multi.score(oneOfFour, [1, 2]), 0); // never negative
  assert.equal(multi.score(oneOfFour, []), 0);
  const twoOfFour = {choices: ['a', 'b', 'c', 'd'], answer: [1, 3]};
  assert.equal(multi.score(twoOfFour, [3]), 0.5); // 1 of 2 correct
  assert.equal(multi.score(twoOfFour, [3, 1]), 1);
  assert.equal(multi.score(twoOfFour, [1, 3, 0]), 0.5);
  assert.equal(Quizy.isFull(multi.score(twoOfFour, [3]), twoOfFour), false);
  const allRight = {choices: ['a', 'b'], answer: [0, 1]}; // W = 0
  assert.equal(multi.score(allRight, [0, 1]), 1);
  assert.equal(multi.score(allRight, [0]), 0.5);
});

test('match: marks × correct pairs / pairs', () => {
  const q = {pairs: [{prompt: 'p1', answer: 'A'}, {prompt: 'p2', answer: 'B'}, {prompt: 'p3', answer: 'C'}], options: ['C', 'B', 'A', 'D'], marks: 3};
  assert.equal(match.score(q, [2, 1, 0]), 3);
  assert.equal(match.score(q, [2, 1, 3]), 2);
  assert.equal(match.score(q, [null, 1, null]), 1);
  assert.equal(match.score(q, [0, 0, 1]), 0);
  close(match.score({...q, marks: 1}, [2, 0, 3]), 1 / 3);
});

test('NLP past paper: all right is 50 / 50, every option picked (or a wrong match) is 0 / 50', () => {
  const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/nlp/past-quiz-2-2025.json'), 'utf8'));
  let right = 0, wrong = 0, marks = 0;
  for (const q of set.questions) {
    const type = Quizy.types[q.type];
    marks += Quizy.marksOf(q);
    if (q.type === 'match') {
      right += type.score(q, q.pairs.map(p => q.options.indexOf(p.answer)));
      wrong += type.score(q, q.pairs.map(p => q.options.findIndex(o => o !== p.answer)));
    } else {
      right += type.score(q, q.answer);
      wrong += type.score(q, q.type === 'multi' ? Quizy.order(q.choices.length) : [Quizy.order(q.choices.length).find(i => !q.answer.includes(i))]);
    }
  }
  assert.equal(marks, 50);
  assert.equal(Quizy.formatMarks(right), '50');
  assert.equal(Quizy.formatMarks(wrong), '0');
});
