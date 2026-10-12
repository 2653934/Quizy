// node --test "tests/*.test.cjs"
// Browse search (src/core/search.js): every term must match, ignoring case and accents, with LaTeX as plain
// text, across the question's fields, its concept and its source number. Also the browse "Copy for Claude" prompt.
const test = require('node:test');
const assert = require('node:assert/strict');
const Quizy = require('./load.cjs');
const {fixture} = require('./fixture.cjs');

const tutorial = {id: 'nlp-tutorial', kind: 'tutorial', title: 'Tutorial'};
const paper = {id: 'nlp-past', kind: 'past-paper', title: 'Past quiz'};
const bank = {id: 'dve-bank', kind: 'lecture-bank', title: 'Bank'};
const attention = {id: 't-5-4', lecture: 7, concept: 'Self-attention calculation', type: 'numeric', number: '5.4', marks: 2,
  question: 'Compute the attention matrix $A = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)$.',
  parts: [{label: '$A_{11}$', answer: 0.5, tolerance: 0.01, marks: 2}], solution: 'Divide by $\\sqrt{2}$, then take the café-style softmax.'};
const choice = {id: 'p-13', lecture: 6, concept: 'Tokenisation', type: 'single', number: 13, question: 'Which is a subword method?',
  choices: ['Byte-pair encoding', 'Stemming'], answer: [0], explanation: 'BPE merges frequent pairs.'};
const slide = {id: 'L1-001', lecture: 1, concept: 'Why explore data', type: 'single', source: {file: 'x.pdf', pages: [9, 10]},
  question: 'What is the main purpose?', choices: ['Understand', 'Guarantee'], answer: [0]};

const finds = (q, set, query) => Quizy.matchesSearch(q, set, Quizy.searchTerms(query));

test('fold and searchTerms: lower case, no accents, split on spaces', () => {
  assert.equal(Quizy.fold('Café ÉCOLE naïve'), 'cafe ecole naive');
  assert.deepEqual(Quizy.searchTerms('  Attention   MATRIX '), ['attention', 'matrix']);
  assert.deepEqual(Quizy.searchTerms(''), []);
});

test('no terms matches everything; every term must match (AND)', () => {
  assert.ok(finds(attention, tutorial, ''));
  assert.ok(finds(attention, tutorial, 'attention matrix'));
  assert.ok(finds(attention, tutorial, 'MATRIX attention'));
  assert.ok(!finds(attention, tutorial, 'attention tokenisation'));
});

test('case and accents are ignored on both sides', () => {
  assert.ok(finds(attention, tutorial, 'CAFE'));
  assert.ok(finds(attention, tutorial, 'café'));
  assert.ok(finds(choice, paper, 'BYTE-PAIR'));
});

test('LaTeX is matched as plain text, not as its source', () => {
  assert.ok(finds(attention, tutorial, 'softmax'));
  assert.ok(finds(attention, tutorial, '√dₖ'));
  assert.ok(finds(attention, tutorial, 'QKᵀ'));
  assert.ok(!finds(attention, tutorial, 'frac'));
  assert.ok(!finds(attention, tutorial, 'sqrt'));
  assert.ok(finds(attention, tutorial, 'A₁₁'));
});

test('source numbers: "Q5.4", "5.4", "Tutorial Q5.4", "Paper Q13", "Slide 9"', () => {
  for (const query of ['Q5.4', '5.4', 'tutorial q5.4']) assert.ok(finds(attention, tutorial, query), query);
  assert.ok(!finds(attention, tutorial, '5.5'));
  for (const query of ['Paper Q13', 'q13', '13']) assert.ok(finds(choice, paper, query), query);
  assert.ok(finds(slide, bank, 'slide 9'));
  assert.equal(Quizy.sourceLabel(attention, tutorial), 'Tutorial Q5.4');
  assert.equal(Quizy.sourceLabel(choice, paper), 'Paper Q13');
  assert.equal(Quizy.sourceLabel({...choice, number: '1.2'}, {kind: 'practice-quiz'}), 'Practice quiz Q1.2');
  assert.equal(Quizy.sourceLabel(slide, bank), 'Slide 9');
  assert.equal(Quizy.sourceLabel({id: 'g'}, {kind: 'generated'}), '');
});

test('searched fields: choices, explanation, concept, solution, accepted answers, model answer, rubric, labels', () => {
  assert.ok(finds(choice, paper, 'stemming'));
  assert.ok(finds(choice, paper, 'merges frequent'));
  assert.ok(finds(choice, paper, 'tokenisation'));
  assert.ok(finds(attention, tutorial, 'divide by'));
  const fx = id => fixture.questions.find(q => q.id === id);
  assert.ok(finds(fx('fx-short'), fixture, 'soft max'));
  assert.ok(finds(fx('fx-written'), fixture, 'because'));
  assert.ok(finds(fx('fx-written'), fixture, 'explains'));
  assert.ok(finds(fx('fx-label'), fixture, 'feed forward'));
  assert.ok(finds(fx('fx-grid'), fixture, 'A[2,1]'));
});

test('every type has a plain-text reference answer for the browse prompt', () => {
  const ref = q => Quizy.types[q.type].reference(q);
  assert.equal(ref(choice), 'Options:\na. Byte-pair encoding\nb. Stemming\n\nCorrect answer:\na. Byte-pair encoding');
  assert.equal(ref({type: 'truefalse', choices: ['True', 'False'], answer: [1]}), 'Correct answer: False');
  assert.ok(ref({type: 'multi', choices: ['x', 'y', 'z'], answer: [0, 2]}).endsWith('Correct answers:\na. x\nc. z'));
  assert.equal(ref({type: 'match', pairs: [{prompt: 'p1', answer: 'A'}, {prompt: 'p2', answer: 'B'}], options: ['A', 'B']}), 'Correct matches:\n- p1 → A\n- p2 → B');
  const fx = id => fixture.questions.find(q => q.id === id);
  assert.equal(ref(fx('fx-label')), 'Correct labels:\n1: Add & Norm\n2: Add & Norm\n3: Softmax');
  assert.ok(ref(fx('fx-numeric')).startsWith('Expected values:\nP(moon | cat on the): 0.008333 (± 0.0001), 4 marks'));
  assert.ok(ref(fx('fx-written')).startsWith('Model answer:\nX is …'));
  assert.equal(ref(fx('fx-short')), 'Accepted answers:\nsoftmax\nsoft max');
  // LaTeX stays as it is for Claude
  assert.ok(ref(attention).includes('$A_{11}$: 0.5 (± 0.01), 2 marks'));
});

test('browse "Copy for Claude" prompt: question, reference, study note, asks for an explanation', () => {
  const subject = {code: 'COMS4054A', name: 'Natural Language Processing'};
  const prompt = Quizy.explainPrompt({subject, set: paper, q: choice, reference: Quizy.types.single.reference(choice)});
  for (const part of ['COMS4054A Natural Language Processing', '"Past quiz"', 'Question (1 mark):\nWhich is a subword method?',
    'Correct answer:\na. Byte-pair encoding', 'Study note:\nBPE merges frequent pairs.', 'Explain why']) assert.ok(prompt.includes(part), part);
  assert.ok(!prompt.includes('written by an AI'));
  const unofficial = Quizy.explainPrompt({subject, set: {...tutorial, unofficialAnswers: true}, q: {...attention, keyDispute: 'Maybe 0.4.'}, reference: 'r'});
  assert.ok(unofficial.includes('\\frac{QK^T}{\\sqrt{d_k}}\\right)$.') && unofficial.includes('Doubt about the official answer:\nMaybe 0.4.') && unofficial.includes('written by an AI'));
});
