// node --test "tests/*.test.cjs"
// Each type's validate() accepts the real data and the new-types fixture (tests/fixture.cjs) and rejects
// broken examples; makeOrder follows the shuffle rules.
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

test('the eight types are registered with the full contract', () => {
  assert.deepEqual(Object.keys(Quizy.types).sort(), ['label', 'match', 'multi', 'numeric', 'short', 'single', 'truefalse', 'written']);
  for (const [name, type] of Object.entries(Quizy.types)) {
    for (const fn of ['validate', 'makeOrder', 'score', 'hints', 'render', 'showResult', 'reference', 'answerKey']) assert.equal(typeof type[fn], 'function', `${name}.${fn}`);
    assert.equal(typeof type.needsCheckButton, 'boolean', `${name}.needsCheckButton`);
    if (type.needsCheckButton) assert.equal(typeof type.readResponse, 'function', `${name}.readResponse`);
    for (const fn of ['askClaude', 'reveal', 'resultNotes']) if (type[fn] !== undefined) assert.equal(typeof type[fn], 'function', `${name}.${fn}`);
    if (type.reveal) assert.equal(type.needsCheckButton, true, `${name}: reveal needs the check button`);
  }
  for (const name of ['short', 'numeric', 'written']) assert.equal(typeof Quizy.types[name].askClaude, 'function', `${name}.askClaude`);
  assert.equal(typeof Quizy.types.written.reveal, 'function');
  assert.equal(Quizy.types.written.checkLabel, 'Reveal model answer');
  assert.equal(typeof Quizy.types.numeric.resultNotes, 'function');
  assert.equal(Quizy.types.label.askClaude, undefined);
  assert.equal(Quizy.types.label.wideFigure, true);
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

const {fixture} = require('./fixture.cjs');

test('the fixture set passes validation', () => {
  for (const q of fixture.questions) {
    const errors = [];
    Quizy.types[q.type].validate(q, fixture, message => errors.push(message));
    assert.deepEqual(errors, [], q.id);
  }
});

test('short rejects broken questions', () => {
  const ok = fixture.questions.find(q => q.id === 'fx-short');
  const at = 'test-set / fx-short';
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, caseSensitive: undefined}), []);
  for (const accept of [undefined, [], 'softmax', [''], ['   '], ['softmax', 3]]) {
    assert.deepEqual(errorsFor({...ok, accept}), [`${at}: accept must be a non-empty array of non-empty strings`], JSON.stringify(accept));
  }
  assert.deepEqual(errorsFor({...ok, caseSensitive: 'no'}), [`${at}: caseSensitive must be true or false`]);
});

test('numeric rejects broken questions', () => {
  const ok = fixture.questions.find(q => q.id === 'fx-numeric');
  const grid = fixture.questions.find(q => q.id === 'fx-grid');
  const at = 'test-set / fx-numeric';
  const part = ok.parts[0];
  const withPart = changes => ({...ok, parts: [{...part, ...changes}]});
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor(grid), []);
  assert.deepEqual(errorsFor({...ok, solution: undefined, inputHint: undefined}), [`${at}: numeric needs a solution`]);
  assert.deepEqual(errorsFor({...ok, solution: ''}), [`${at}: numeric needs a solution`]);
  assert.deepEqual(errorsFor({...ok, parts: []}), [`${at}: numeric needs parts`]);
  assert.deepEqual(errorsFor(withPart({label: ''})), [`${at} part 1: missing label`]);
  assert.deepEqual(errorsFor(withPart({answer: '0.5'})), [`${at} part 1: answer must be a finite number`]);
  assert.deepEqual(errorsFor(withPart({answer: Infinity})), [`${at} part 1: answer must be a finite number`]);
  assert.deepEqual(errorsFor(withPart({tolerance: undefined})), [`${at} part 1: needs exactly one of tolerance or relTolerance`]);
  assert.deepEqual(errorsFor(withPart({relTolerance: 0.01})), [`${at} part 1: needs exactly one of tolerance or relTolerance`]);
  assert.deepEqual(errorsFor(withPart({tolerance: 0})), [`${at} part 1: tolerance must be a positive number`]);
  assert.deepEqual(errorsFor(withPart({tolerance: -0.1})), [`${at} part 1: tolerance must be a positive number`]);
  assert.deepEqual(errorsFor(withPart({tolerance: undefined, relTolerance: 0.01, answer: 0})), [`${at} part 1: relTolerance needs a non-zero answer`]);
  assert.deepEqual(errorsFor(withPart({marks: 3})), [`${at}: part marks add up to 3, but the question has 4`]);
  assert.deepEqual(errorsFor(withPart({marks: 0})), [`${at} part 1: marks must be a positive number`, `${at}: part marks add up to 0, but the question has 4`]);
  assert.deepEqual(errorsFor(withPart({unit: 5})), [`${at} part 1: unit must be text`]);
  // Fractional marks add up without floating-point trouble (0.1 + 0.2).
  assert.deepEqual(errorsFor({...ok, marks: 0.3, parts: [{...part, marks: 0.1}, {...part, marks: 0.2}]}), []);
  const g = 'test-set / fx-grid';
  assert.deepEqual(errorsFor({...grid, grid: {rows: 1, cols: 2}}), [`${g}: grid is 1 × 2 but there are 4 parts`]);
  assert.deepEqual(errorsFor({...grid, grid: {rows: 2}}), [`${g}: grid needs whole-number rows and cols`]);
  assert.deepEqual(errorsFor({...grid, grid: {rows: 0, cols: 4}}), [`${g}: grid needs whole-number rows and cols`]);
  assert.deepEqual(errorsFor({...grid, grid: null}), [`${g}: grid needs whole-number rows and cols`]);
});

test('written rejects broken questions', () => {
  const ok = fixture.questions.find(q => q.id === 'fx-written');
  const at = 'test-set / fx-written';
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, explanation: 'A study note.'}), []);
  assert.deepEqual(errorsFor({...ok, modelAnswer: ''}), [`${at}: written needs a modelAnswer`]);
  assert.deepEqual(errorsFor({...ok, rubric: []}), [`${at}: written needs a rubric`]);
  assert.deepEqual(errorsFor({...ok, rubric: undefined}), [`${at}: written needs a rubric`]);
  assert.deepEqual(errorsFor({...ok, rubric: [{point: '', marks: 1}, {point: 'b', marks: 2}]}), [`${at} rubric 1: missing point text`]);
  assert.deepEqual(errorsFor({...ok, rubric: [{point: 'a', marks: 0}, {point: 'b', marks: 3}]}), [`${at} rubric 1: marks must be a positive number`]);
  assert.deepEqual(errorsFor({...ok, rubric: [{point: 'a', marks: 1}, {point: 'b', marks: 1}]}), [`${at}: rubric marks add up to 2, but the question has 3`]);
  assert.deepEqual(errorsFor({...ok, marks: undefined, rubric: [{point: 'a', marks: 1}]}), []); // marks default to 1
});

test('label rejects broken questions', () => {
  const ok = fixture.questions.find(q => q.id === 'fx-label');
  const at = 'test-set / fx-label';
  assert.deepEqual(errorsFor(ok), []);
  assert.deepEqual(errorsFor({...ok, image: undefined}), [`${at}: label needs an image`]);
  assert.deepEqual(errorsFor({...ok, labels: []}), [`${at}: label needs labels`]);
  assert.deepEqual(errorsFor({...ok, labels: undefined}), [`${at}: label needs labels`]);
  assert.deepEqual(errorsFor({...ok, options: ['Softmax']}), [`${at}: label needs at least two text options`]);
  assert.deepEqual(errorsFor({...ok, options: ['Add & Norm', 'Softmax', '']}), [`${at}: label needs at least two text options`]);
  assert.deepEqual(errorsFor({...ok, options: [...ok.options, 'Softmax']}), [`${at}: label options must not repeat`]);
  assert.deepEqual(errorsFor({...ok, labels: [{number: 1, answer: 'Softmax'}, {number: 1, answer: 'Linear'}]}), [`${at} label 2: number 1 is used twice`]);
  for (const number of [0, -1, 1.5, '1', undefined]) {
    assert.deepEqual(errorsFor({...ok, labels: [{number, answer: 'Softmax'}]}), [`${at} label 1: number must be a positive whole number`], String(number));
  }
  assert.deepEqual(errorsFor({...ok, labels: [{number: 1, answer: 'Encoder'}]}), [`${at} label 1: answer "Encoder" is not in options`]);
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
  for (const q of fixture.questions.filter(q => q.type !== 'label')) assert.deepEqual(Quizy.types[q.type].makeOrder(q, Quizy.shuffle), {choiceOrder: [], pairOrder: [], optionOrder: []}, q.id);
  // label: rows in number order (never shuffled), options shuffled.
  const l = fixture.questions.find(q => q.id === 'fx-label');
  for (let i = 0; i < 5; i++) {
    const o = Quizy.types.label.makeOrder(l, Quizy.shuffle);
    assert.deepEqual(o.pairOrder, [1, 2, 0]);
    assert.deepEqual(sorted(o.optionOrder), [0, 1, 2, 3]);
    assert.deepEqual(o.choiceOrder, []);
  }
  Quizy.seedRandom(null);
});
