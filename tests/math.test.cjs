// node --test "tests/*.test.cjs"
// Maths in data strings (src/core/math.js): the $ splitter, mathToPlain, the KaTeX check and the build's
// maths validation (tools/build-data.cjs run on a scratch folder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const Quizy = require('./load.cjs');
const katex = require('../vendor/katex/katex.min.js');

const split = text => Quizy.splitMath(text).map(({type, value}) => [type, value]);

test('splitMath: text without $ is one text part', () => {
  assert.deepEqual(split('No maths here.\nSecond line.'), [['text', 'No maths here.\nSecond line.']]);
  assert.deepEqual(split(''), []);
  assert.equal(Quizy.splitMath('plain').unbalanced, false);
});

test('splitMath: inline and display maths', () => {
  assert.deepEqual(split('Scale by $\\sqrt{d_k}$ first.'), [['text', 'Scale by '], ['inline', '\\sqrt{d_k}'], ['text', ' first.']]);
  assert.deepEqual(split('$a$$b$'), [['inline', 'a'], ['inline', 'b']]);
  assert.deepEqual(split('So\n$$\\frac{QK^\\top}{\\sqrt{d_k}}$$\nthen'),
    [['text', 'So\n'], ['display', '\\frac{QK^\\top}{\\sqrt{d_k}}'], ['text', '\nthen']]);
  assert.deepEqual(split('$x$ and $$y$$'), [['inline', 'x'], ['text', ' and '], ['display', 'y']]);
});

test('splitMath: \\$ is a literal dollar sign, also next to maths', () => {
  assert.deepEqual(split('It costs \\$5.'), [['text', 'It costs $5.']]);
  assert.deepEqual(split('\\$5 and $x$'), [['text', '$5 and '], ['inline', 'x']]);
  // inside maths the escape is left for KaTeX
  assert.deepEqual(split('$\\$5$'), [['inline', '\\$5']]);
  assert.equal(Quizy.splitMath('It costs \\$5.').unbalanced, false);
});

test('splitMath: an unclosed $ stays as text and is flagged', () => {
  const parts = Quizy.splitMath('Costs $5 today');
  assert.deepEqual(parts.map(({type, value}) => [type, value]), [['text', 'Costs $5 today']]);
  assert.equal(parts.unbalanced, true);
  assert.equal(Quizy.splitMath('$x$ then $y').unbalanced, true);
  assert.equal(Quizy.splitMath('$$x$ ').unbalanced, true);
});

test('mathToPlain: simple LaTeX as Unicode, delimiters removed', () => {
  const cases = {
    'No maths, unchanged: \\n stays': 'No maths, unchanged: \\n stays',
    '$\\sqrt{d_k}$': '√dₖ',
    '$QK^T$': 'QKᵀ',
    '$Q K^\\top$': 'Q Kᵀ',
    '$x_k$': 'xₖ',
    '$a \\cdot b \\times c$': 'a · b × c',
    '$\\alpha + \\beta = \\Sigma$': 'α + β = Σ',
    '$\\frac{QK^T}{\\sqrt{d_k}}$': 'QKᵀ/√dₖ',
    '$\\frac{a+b}{2}$': '(a+b)/2',
    '$\\text{softmax}(x)_i$': 'softmax(x)ᵢ',
    '$x^{-1}$': 'x⁻¹',
    'Costs \\$5': 'Costs $5',
    'Let $\\{a, b\\}$ be': 'Let {a, b} be',
    '$\\hat{y}$': '\\haty' // not handled: the LaTeX source, without braces
  };
  for (const [tex, plain] of Object.entries(cases)) assert.equal(Quizy.mathToPlain(tex), plain, tex);
});

test('checkMath: unbalanced $ and formulas KaTeX cannot parse', () => {
  assert.deepEqual(Quizy.checkMath('no maths', katex), []);
  assert.deepEqual(Quizy.checkMath('Fine: $\\frac{1}{2}$ and $$\\sum_{i=1}^n x_i$$ and \\$3', katex), []);
  assert.match(Quizy.checkMath('Costs $5', katex)[0], /unbalanced \$/);
  assert.match(Quizy.checkMath('$\\frac{1}{$', katex)[0], /KaTeX can't read "\\frac\{1\}\{"/);
  assert.match(Quizy.checkMath('$\\notacommand{x}$', katex)[0], /Undefined control sequence/);
  assert.match(Quizy.checkMath('$ $', katex)[0], /empty maths/);
});

test('shownFields lists every text field the app shows', () => {
  const q = {question: 'Q', choices: ['a', 'b'], pairs: [{prompt: 'p', answer: 'o'}], options: ['o'], labels: [{number: 1, answer: 'o'}],
    accept: ['x'], parts: [{label: 'L', unit: 'u'}], inputHint: 'h', solution: 's', modelAnswer: 'm', rubric: [{point: 'r'}],
    explanation: 'e', keyDispute: 'k', optionsNote: 'n'};
  assert.deepEqual(Quizy.shownFields(q).map(([name]) => name), ['question', 'choices[0]', 'choices[1]', 'pairs[0]', 'pairs.answer[0]', 'options[0]',
    'labels.answer[0]', 'accept[0]', 'parts.label[0]', 'parts.unit[0]', 'inputHint', 'solution', 'modelAnswer', 'rubric[0]', 'explanation', 'keyDispute', 'optionsNote']);
});

// A scratch folder laid out like the repo, with one set whose explanation is `explanation`.
function build(explanation, description = 'A set.') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizy-build-'));
  fs.mkdirSync(path.join(dir, 'data', 'tt'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'generated'));
  fs.writeFileSync(path.join(dir, 'data', 'subjects.json'), JSON.stringify({subjects: [{key: 'tt', code: 'TT', name: 'Test',
    theme: {accent: '#147d83', paper: '#f2f5f4', light: '#dbefee', aside: '#e8f0ef'}, sets: ['tt-maths']}]}));
  fs.writeFileSync(path.join(dir, 'data', 'tt', 'maths.json'), JSON.stringify({id: 'tt-maths', subject: 'tt', title: 'Maths', kind: 'generated', description,
    questions: [{id: 'tt-1', lecture: 1, concept: 'Scaling', type: 'single', question: 'Why divide by $\\sqrt{d_k}$?', choices: ['$a$', 'b'], answer: [0], explanation}]}));
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-data.cjs'), dir], {encoding: 'utf8'});
  const bundle = fs.existsSync(path.join(dir, 'generated', 'quizy-data.js'));
  fs.rmSync(dir, {recursive: true, force: true});
  return {status: run.status, out: run.stdout + run.stderr, bundle};
}

test('build: good maths passes and is bundled', () => {
  const result = build('Inline $x^2$, display $$\\frac{QK^\\top}{\\sqrt{d_k}}$$ and a dollar \\$5.');
  assert.equal(result.status, 0, result.out);
  assert.ok(result.bundle);
});

test('build: a bad formula or an unbalanced $ fails, naming the question and field', () => {
  const bad = build('Bad: $\\frac{1}{$');
  assert.equal(bad.status, 1);
  assert.match(bad.out, /tt-maths \/ tt-1 explanation: KaTeX can't read/);
  assert.equal(bad.bundle, false);
  const unbalanced = build('Costs $5.');
  assert.equal(unbalanced.status, 1);
  assert.match(unbalanced.out, /tt-maths \/ tt-1 explanation: unbalanced \$/);
  const description = build('Fine.', 'Bad $\\sqrt{$ description');
  assert.equal(description.status, 1);
  assert.match(description.out, /tt-maths description: KaTeX can't read/);
});
