// node --test "tests/*.test.cjs"
// The quiz extras that hold logic: the rapid-mode celebration words, the one-time intro cue's storage flag
// and "Reset wrong answers" (only the wrong attempts of the current subject are removed).
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeStorage = () => {
  const items = new Map();
  return {items, getItem: k => items.has(k) ? items.get(k) : null, setItem: (k, v) => items.set(k, String(v))};
};
globalThis.localStorage = fakeStorage();
const Quizy = require('./load.cjs');
require('../src/core/storage.js');
const {state, storage} = Quizy;

test('celebration: a word from the list, never the same twice in a row', () => {
  assert.ok(Quizy.CELEBRATIONS.length >= 4);
  for (const word of ['BAM!', 'BOOM!', 'WOW!', 'AWESOME!']) assert.ok(Quizy.CELEBRATIONS.includes(word), word);
  let previous = null;
  const seen = new Set();
  const random = Quizy.seeded(11);
  for (let i = 0; i < 200; i++) {
    const word = Quizy.pickCelebration(previous, random);
    assert.ok(Quizy.CELEBRATIONS.includes(word));
    assert.notEqual(word, previous);
    seen.add(word);
    previous = word;
  }
  assert.equal(seen.size, Quizy.CELEBRATIONS.length);
  // The edges of the random range stay in bounds.
  assert.ok(Quizy.CELEBRATIONS.includes(Quizy.pickCelebration(null, () => 0)));
  assert.ok(Quizy.CELEBRATIONS.includes(Quizy.pickCelebration('BAM!', () => 0.999999)));
  assert.notEqual(Quizy.pickCelebration(Quizy.CELEBRATIONS[0], () => 0), Quizy.CELEBRATIONS[0]);
});

test('intro cue: unseen until marked, stored once per browser profile', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(storage.introSeen(), false);
  storage.setIntroSeen();
  assert.equal(storage.introSeen(), true);
  assert.deepEqual([...localStorage.items], [['quizy-intro-v1', 'seen']]);
  localStorage.setItem('quizy-intro-v1', 'something else');
  assert.equal(storage.introSeen(), false);
});

test('intro cue: blocked storage never throws (and reads as unseen)', () => {
  const blocked = () => { throw new Error('SecurityError'); };
  globalThis.localStorage = {getItem: blocked, setItem: blocked};
  assert.equal(storage.introSeen(), false);
  assert.doesNotThrow(() => storage.setIntroSeen());
  delete globalThis.localStorage;
  assert.equal(storage.introSeen(), false);
});

const subject = (key, sets) => ({key, code: key.toUpperCase(), name: key, sets: sets.map(s => s.id)});
const set = (id, ids) => ({id, title: id, kind: 'generated', questions: ids.map(qid => ({id: qid, type: 'single', choices: ['a', 'b'], answer: [0], lecture: 1}))});

test('wrongQuestionIds: only questions of the subject whose latest attempt was not fully correct', () => {
  const questions = set('x-a', ['q1', 'q2', 'q3', 'q4']).questions;
  const attempts = {q1: {correct: true, score: 1}, q2: {correct: false, score: 0}, q3: {correct: false, score: 0.5}, gone: {correct: false}};
  assert.deepEqual(Quizy.wrongQuestionIds(questions, attempts), ['q2', 'q3']);
  assert.deepEqual(Quizy.wrongQuestionIds(questions, {}), []);
});

test('resetWrong: removes only the wrong attempts of the current subject and saves them', () => {
  globalThis.localStorage = fakeStorage();
  const a = set('x-a', ['q1', 'q2']);
  const b = set('x-b', ['q3', 'q4']);
  const other = set('y-a', ['p1']);
  state.data = {subjects: [subject('x', [a, b]), subject('y', [other])], sets: {'x-a': a, 'x-b': b, 'y-a': other}};
  const xAttempts = {q1: {correct: true, score: 1, at: 't1'}, q2: {correct: false, score: 0, at: 't2'}, q3: {correct: false, score: 0.5, at: 't3'}, old: {correct: false, score: 0, at: 't0'}};
  storage.saveAttempts('x', xAttempts);
  storage.saveAttempts('y', {p1: {correct: false, score: 0, at: 't4'}});
  storage.saveWritten('x', {q2: 'my draft'});
  storage.saveLectures('x', ['1']);
  storage.setColorMode('dark');
  const untouched = Object.fromEntries([...localStorage.items].filter(([key]) => key !== 'quizy-attempts-v2-x'));

  Quizy.selectSubject('x', storage.loadAttempts);
  assert.deepEqual(Quizy.wrongQuestionIds(Quizy.allQuestions(), state.attempts), ['q2', 'q3']);
  const removed = Quizy.resetWrong();
  assert.deepEqual(removed, ['q2', 'q3']);
  storage.saveAttempts('x', state.attempts);

  // Correct answers and attempts for questions no longer in the bank stay; everything else in storage is unchanged.
  assert.deepEqual(storage.loadAttempts('x'), {q1: {correct: true, score: 1, at: 't1'}, old: {correct: false, score: 0, at: 't0'}});
  assert.deepEqual(Object.fromEntries([...localStorage.items].filter(([key]) => key !== 'quizy-attempts-v2-x')), untouched);
  assert.deepEqual(Quizy.wrongQuestionIds(Quizy.allQuestions(), state.attempts), []);
  assert.deepEqual(Quizy.resetWrong(), []);
});
