// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/random.js');
require('../src/core/util.js');
const Quizy = require('../src/core/scoring.js');

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
