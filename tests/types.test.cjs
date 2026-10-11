// node --test "tests/*.test.cjs"
// Each type's validate() accepts the real data and rejects broken examples; makeOrder follows the shuffle rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Quizy = require('./load.cjs');

const root = path.join(__dirname, '..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const realSets = readJSON('data/subjects.json').subjects.flatMap(s => s.sets.map(id => readJSON(Quizy.setFile(s.key, id))));
const set = {id: 'test-set', kind: 'generated'};
const errorsFor = q => {
  const errors = [];
  Quizy.types[q.type].validate(q, set, message => errors.push(message));
  return errors;
};

test('the four types are registered with the full contract', () => {
  assert.deepEqual(Object.keys(Quizy.types).sort(), ['match', 'multi', 'single', 'truefalse']);
  for (const [name, type] of Object.entries(Quizy.types)) {
    for (const fn of ['validate', 'makeOrder', 'score', 'hints', 'render', 'showResult']) assert.equal(typeof type[fn], 'function', `${name}.${fn}`);
    assert.equal(typeof type.needsCheckButton, 'boolean', `${name}.needsCheckButton`);
    if (type.needsCheckButton) assert.equal(typeof type.readResponse, 'function', `${name}.readResponse`);
  }
});

test('every real question passes its type validation', () => {
  let count = 0;
  for (const s of realSets) {
    for (const q of s.questions) {
      const errors = [];
      Quizy.types[q.type].validate(q, s, message => errors.push(message));
      assert.deepEqual(errors, [], `${s.id} / ${q.id}`);
      count++;
    }
  }
  assert.ok(count > 400);
});

test('single rejects broken questions', () => {
  const ok = {id: 's', type: 'single', choices: ['a', 'b', 'c'], answer: [1]};
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, choices: ['only one']}), ['test-set / s: needs at least two text choices']);
  assert.deepEqual(errorsFor({...ok, choices: ['a', '']}), ['test-set / s: needs at least two text choices']);
  assert.deepEqual(errorsFor({...ok, answer: []}), ['test-set / s: answer must be a non-empty array of indices']);
  assert.deepEqual(errorsFor({...ok, answer: 1}), ['test-set / s: answer must be a non-empty array of indices']);
  assert.deepEqual(errorsFor({...ok, answer: [3]}), ['test-set / s: answer index out of range']);
  assert.deepEqual(errorsFor({...ok, answer: [0, 1]}), ['test-set / s: single must have exactly one answer']);
  assert.deepEqual(errorsFor({...ok, answer: [1, 1]}), ['test-set / s: repeated answer index', 'test-set / s: single must have exactly one answer']);
  assert.deepEqual(errorsFor({...ok, emphasisInChoices: {5: ['a']}}), ['test-set / s: emphasisInChoices index 5 out of range']);
  assert.deepEqual(errorsFor({...ok, emphasisInChoices: {0: ['zzz']}}), ['test-set / s choice 0: emphasis "zzz" does not appear in the text']);
});

test('truefalse rejects broken questions', () => {
  const ok = {id: 't', type: 'truefalse', choices: ['True', 'False'], answer: [0]};
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, choices: ['False', 'True']}), ['test-set / t: truefalse choices must be exactly ["True","False"]']);
  assert.deepEqual(errorsFor({...ok, choices: ['Yes', 'No']}), ['test-set / t: truefalse choices must be exactly ["True","False"]']);
  assert.deepEqual(errorsFor({...ok, answer: [0, 1]}), ['test-set / t: truefalse must have exactly one answer']);
  assert.deepEqual(errorsFor({...ok, answer: [2]}), ['test-set / t: answer index out of range']);
});

test('multi rejects broken questions', () => {
  const ok = {id: 'm', type: 'multi', choices: ['a', 'b', 'c', 'd'], answer: [0, 2]};
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, answer: [0, 1, 2, 3]}), []);
  assert.deepEqual(errorsFor({...ok, answer: []}), ['test-set / m: answer must be a non-empty array of indices']);
  assert.deepEqual(errorsFor({...ok, answer: [0, -1]}), ['test-set / m: answer index out of range']);
  assert.deepEqual(errorsFor({...ok, answer: [2, 2]}), ['test-set / m: repeated answer index']);
  assert.deepEqual(errorsFor({...ok, answer: [1.5]}), ['test-set / m: answer index out of range']);
});

test('match rejects broken questions', () => {
  const ok = {id: 'x', type: 'match', pairs: [{prompt: 'p1', answer: 'A'}, {prompt: 'p2', answer: 'B'}], options: ['A', 'B', 'C']};
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, pairs: []}), ['test-set / x: match needs pairs']);
  assert.deepEqual(errorsFor({...ok, options: ['A']}), ['test-set / x: match needs at least two options']);
  assert.deepEqual(errorsFor({...ok, options: ['A', 'B', '']}), ['test-set / x: match needs at least two options']);
  assert.deepEqual(errorsFor({...ok, pairs: [{prompt: '', answer: 'A'}]}), ['test-set / x: a pair is missing its prompt']);
  assert.deepEqual(errorsFor({...ok, pairs: [{prompt: 'p', answer: 'Z'}]}), ['test-set / x: pair answer "Z" is not in options']);
});

test('makeOrder: truefalse never shuffles, the others are permutations', () => {
  const sorted = list => [...list].sort((a, b) => a - b);
  Quizy.seedRandom(3);
  const tf = Quizy.types.truefalse.makeOrder({choices: ['True', 'False']}, Quizy.shuffle);
  assert.deepEqual(tf, {choiceOrder: [0, 1], pairOrder: [], optionOrder: []});
  for (const type of ['single', 'multi']) {
    const o = Quizy.types[type].makeOrder({choices: ['a', 'b', 'c', 'd', 'e']}, Quizy.shuffle);
    assert.deepEqual(sorted(o.choiceOrder), [0, 1, 2, 3, 4]);
    assert.deepEqual([o.pairOrder, o.optionOrder], [[], []]);
  }
  const m = Quizy.types.match.makeOrder({pairs: [{}, {}, {}], options: ['a', 'b', 'c', 'd']}, Quizy.shuffle);
  assert.deepEqual(sorted(m.pairOrder), [0, 1, 2]);
  assert.deepEqual(sorted(m.optionOrder), [0, 1, 2, 3]);
  assert.deepEqual(m.choiceOrder, []);
  Quizy.seedRandom(null);
});
