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

const {fixture} = require('./fixture.cjs');
const fx = id => fixture.questions.find(q => q.id === id);
const {short, numeric, written} = Quizy.types;

test('short: trims, collapses whitespace, ignores case unless caseSensitive', () => {
  const q = fx('fx-short');
  for (const typed of ['softmax', 'Softmax', '  SOFTMAX ', 'soft max', 'Soft   Max', '\tsoft\n max ']) assert.equal(short.score(q, typed), 1, JSON.stringify(typed));
  for (const typed of ['', 'softmaxx', 'soft-max', 'sigmoid', 'softmax function']) assert.equal(short.score(q, typed), 0, JSON.stringify(typed));
  const exact = {...q, accept: ['  NumPy '], caseSensitive: true, marks: 2};
  assert.equal(short.score(exact, 'NumPy'), 2);
  assert.equal(short.score(exact, ' NumPy  '), 2);
  assert.equal(short.score(exact, 'numpy'), 0);
});

test('parseNumber: accepted formats', () => {
  const cases = {
    '0.0083': 0.0083, '.0083': 0.0083, '-1.2': -1.2, '+3': 3, '42': 42, '5.': 5, '8.33e-3': 0.00833, '8.33E-3': 0.00833, '1e3': 1000,
    '0,0083': 0.0083, ',5': 0.5, '1/120': 1 / 120, ' 1 / 120 ': 1 / 120, '-1/4': -0.25, '0.5/2': 0.25, '1,5/3': 0.5,
    '  0.25  ': 0.25, '−0.5': -0.5, '0': 0, '-0': -0
  };
  for (const [text, value] of Object.entries(cases)) close(Quizy.parseNumber(text), value);
});

test('parseNumber: rejected input is null', () => {
  for (const text of ['', '   ', 'abc', '0.5a', '1/2/3', '2*3', '1+2', '(1)', '1e', 'e5', '.', '-', '0x10', 'Infinity', 'NaN', '1 2', '--1',
    '1/0', '0/0', '1,000.5', '1.2.3', '½', '1/', '/2', '50%', '1e400', null, undefined]) {
    assert.equal(Quizy.parseNumber(text), null, JSON.stringify(text));
  }
});

test('numeric: absolute tolerance, edges included', () => {
  const q = fx('fx-numeric'); // answer 0.008333 ± 0.0001, 4 marks
  for (const typed of ['0.008333', '0.0083', '.0083', '1/120', '8.33e-3', '8.33E-3', '0,0083', '0.008433', '0.008233']) assert.equal(numeric.score(q, [typed]), 4, typed);
  for (const typed of ['0.008434', '0.008232', '0.0085', '0.83', '', 'abc', '1/0']) assert.equal(numeric.score(q, [typed]), 0, typed);
  // A whole-number tolerance at the edge.
  const wide = {marks: 1, parts: [{label: 'n', answer: 10, tolerance: 0.5, marks: 1}]};
  assert.equal(numeric.score(wide, ['10.5']), 1);
  assert.equal(numeric.score(wide, ['9.5']), 1);
  assert.equal(numeric.score(wide, ['10.5001']), 0);
});

test('numeric: relative tolerance and per-part marks in a grid', () => {
  const q = fx('fx-grid'); // 0.6 0.4 / 0.3 0.7, ± 1% each, 1 mark each
  assert.equal(numeric.score(q, ['0.6', '0.4', '0.3', '0.7']), 4);
  assert.equal(numeric.score(q, ['0.606', '0.396', '0.297', '0.707']), 4); // exactly 1% off
  assert.equal(numeric.score(q, ['0.6061', '0.4', '0.3', '0.7']), 3);
  assert.equal(numeric.score(q, ['0.6', 'x', '', '0.7']), 2);
  assert.equal(numeric.score(q, ['3/5', '2/5', '0,3', '7e-1']), 4);
  const negative = {marks: 1, parts: [{label: 'x', answer: -2, relTolerance: 0.1, marks: 1}]};
  assert.equal(numeric.score(negative, ['-2.2']), 1);
  assert.equal(numeric.score(negative, ['-1.79']), 0);
  const halves = {marks: 1.5, parts: [{label: 'a', answer: 1, tolerance: 0.01, marks: 0.5}, {label: 'b', answer: 2, tolerance: 0.01, marks: 1}]};
  assert.equal(numeric.score(halves, ['1', '0']), 0.5);
  assert.equal(Quizy.isFull(numeric.score(halves, ['1', '2']), halves), true);
});

test('written: score is the sum of the ticked rubric marks', () => {
  const q = fx('fx-written'); // 1 + 2 marks
  assert.equal(written.score(q, {text: '', ticked: []}), 0);
  assert.equal(written.score(q, {text: 'x', ticked: [0]}), 1);
  assert.equal(written.score(q, {text: 'x', ticked: [1]}), 2);
  assert.equal(written.score(q, {text: 'x', ticked: [1, 0]}), 3);
  assert.equal(written.score(q, {text: 'x', ticked: [1, 1, 5]}), 2); // repeats and unknown indices are ignored
  assert.equal(Quizy.isFull(written.score(q, {text: '', ticked: [0, 1]}), q), true);
});

test('label: marks × correct labels / labels', () => {
  const q = fx('fx-label'); // 6 marks; labels 3 Softmax, 1 Add & Norm, 2 Add & Norm; options Add & Norm, Feed Forward, Softmax, Linear
  const {label} = Quizy.types;
  assert.equal(label.score(q, [2, 0, 0]), 6);
  assert.equal(label.score(q, [2, 0, 1]), 4);
  assert.equal(label.score(q, [null, 0, null]), 2);
  assert.equal(label.score(q, [0, 2, 3]), 0);
  assert.equal(label.score(q, [3, 3, 3]), 0);
  close(label.score({...q, marks: 1}, [2, 1, 1]), 1 / 3);
  assert.equal(Quizy.isFull(label.score(q, [2, 0, 1]), q), false);
});

test('Copy for Claude prompt', () => {
  const subject = {code: 'COMS4054A', name: 'Natural Language Processing'};
  const prompt = (id, response) => Quizy.claudePrompt({subject, set: fixture, q: fx(id), ...Quizy.types[fx(id).type].askClaude(fx(id), response)});
  const w = prompt('fx-written', {text: 'My answer.', ticked: []});
  for (const part of ['COMS4054A Natural Language Processing', '"New types fixture"', 'Question (3 marks):\nExplain X.', 'My answer:\nMy answer.',
    'Model answer:\nX is …\nBecause …', 'Rubric:\n- [1 mark] States that …\n- [2 marks] Explains …', 'written by an AI', 'one tip']) {
    assert.ok(w.includes(part), part);
  }
  assert.ok(prompt('fx-written', {text: '  ', ticked: []}).includes('I didn’t write anything down'));
  const n = prompt('fx-numeric', [' 1/120 ']);
  assert.ok(n.includes('My answer:\nP(moon | cat on the): 1/120'));
  assert.ok(n.includes('Expected values:\nP(moon | cat on the): 0.008333 (± 0.0001), 4 marks'));
  assert.ok(n.includes('Worked solution:\nCount the trigrams.\nDivide: 1/120.'));
  assert.ok(prompt('fx-grid', ['0.6', '', '0.3', '0.7']).includes('A[1,2]: (no answer)\nA[2,1]: 0.3'));
  assert.ok(prompt('fx-grid', ['0.6', '', '0.3', '0.7']).includes('A[1,1]: 0.6 (± 1%), 1 mark'));
  const s = prompt('fx-short', 'soft max');
  assert.ok(s.includes('Question (1 mark):') && s.includes('My answer:\nsoft max') && s.includes('Accepted answers:\nsoftmax\nsoft max'));
  const official = Quizy.claudePrompt({subject, set: {...fixture, unofficialAnswers: undefined}, q: fx('fx-short'), answer: 'a', reference: 'b'});
  assert.ok(!official.includes('written by an AI'));
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

test('state: recordAnswer feeds attempts and roundTotals', () => {
  const sets = {'x-a': {id: 'x-a', totalMarks: 3, questions: [{id: 'q1', marks: 2}, {id: 'q2'}]}};
  Quizy.state.data = {subjects: [{key: 'x', sets: ['x-a']}], sets};
  Quizy.selectSubject('missing', () => ({}));
  assert.equal(Quizy.state.subject.key, 'x');
  Quizy.beginRound(sets['x-a'], sets['x-a'].questions.map(q => ({q})));
  Quizy.recordAnswer(1);
  assert.equal(Quizy.nextItem(), true);
  Quizy.recordAnswer(1);
  assert.equal(Quizy.nextItem(), false);
  assert.deepEqual(Quizy.state.attempts.q1.correct, false);
  assert.deepEqual(Quizy.state.attempts.q2.correct, true);
  assert.deepEqual(Quizy.roundTotals(Quizy.state.round), {score: 2, full: 1, marks: 3, count: 2});
});
