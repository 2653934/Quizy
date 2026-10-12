// A tiny set exercising every typed question type (short, numeric with and without a grid, written, label).
// It lives only in the tests, not in data/. Used by types.test.cjs and scoring.test.cjs.
const fixture = {
  id: 'test-new-types', subject: 'test', title: 'New types fixture', kind: 'tutorial', unofficialAnswers: true,
  questions: [
    {id: 'fx-short', lecture: 1, concept: 'Softmax', type: 'short', question: 'Name the function.', marks: 1,
      accept: ['softmax', 'soft max'], caseSensitive: false, explanation: 'Softmax.'},
    {id: 'fx-numeric', lecture: 2, concept: 'N-grams', type: 'numeric', question: 'P(moon | cat on the)?', marks: 4,
      parts: [{label: 'P(moon | cat on the)', answer: 0.008333, tolerance: 0.0001, marks: 4, unit: ''}],
      inputHint: 'Give your answer to 4 decimal places.', solution: 'Count the trigrams.\nDivide: 1/120.'},
    {id: 'fx-grid', lecture: 2, concept: 'Attention', type: 'numeric', question: 'Fill in the attention matrix.', marks: 4,
      parts: [0.6, 0.4, 0.3, 0.7].map((answer, i) => ({label: `A[${Math.floor(i / 2) + 1},${i % 2 + 1}]`, answer, relTolerance: 0.01, marks: 1})),
      grid: {rows: 2, cols: 2}, solution: 'Softmax each row.'},
    {id: 'fx-written', lecture: 3, concept: 'Tokenisation', type: 'written', question: 'Explain X.', marks: 3,
      modelAnswer: 'X is …\nBecause …', rubric: [{point: 'States that …', marks: 1}, {point: 'Explains …', marks: 2}]},
    {id: 'fx-label', lecture: 4, concept: 'Transformer', type: 'label', question: 'Label the parts marked 1–3.', marks: 6,
      image: {src: 'data/nlp/img/q20-attention-map.png', alt: 'Diagram with three numbered boxes'},
      labels: [{number: 3, answer: 'Softmax'}, {number: 1, answer: 'Add & Norm'}, {number: 2, answer: 'Add & Norm'}],
      options: ['Add & Norm', 'Feed Forward', 'Softmax', 'Linear'], explanation: 'Labels.'}
  ]
};

module.exports = {fixture};
