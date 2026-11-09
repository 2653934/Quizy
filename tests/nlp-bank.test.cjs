const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', 'nlp', `${name}.json`), 'utf8'));
const subject = JSON.parse(fs.readFileSync(path.join(root, 'data', 'subjects.json'), 'utf8'))
  .subjects.find(s => s.key === 'nlp');

test('the single NLP practice bank retains every former generated question and its id', () => {
  const sources = ['new-questions', 'label-diagrams', ...Array.from({length: 10}, (_, i) => `bank-lecture-${i + 1}`)];
  const expected = sources.flatMap(name => read(name).questions);
  const actual = read('practice-bank').questions;
  const byId = new Map(actual.map(q => [q.id, q]));
  assert.equal(subject.sets.filter(id => id.includes('bank')).length, 1);
  assert.ok(subject.sets.includes('nlp-practice-bank'));
  assert.equal(byId.size, actual.length, 'practice question IDs must be unique');
  for (const q of expected) assert.deepEqual(byId.get(q.id), q, `changed or missing ${q.id}`);
});

test('new long written practice has complete answers and distinct task-adaptation variants', () => {
  const long = read('practice-bank').questions.filter(q => q.id.startsWith('nlp-long-'));
  assert.equal(long.length, 19);
  for (const q of long) {
    assert.equal(q.type, 'written');
    assert.equal(q.marks, 10);
    assert.ok(q.modelAnswer.length > 150, q.id);
    assert.equal(q.rubric.reduce((sum, point) => sum + point.marks, 0), q.marks, q.id);
    assert.ok(q.explanation.includes('unofficial') || q.explanation.includes('Unofficial'), q.id);
  }
  for (const id of ['nlp-long-b4', 'nlp-long-gpt-classification', 'nlp-long-gpt-similarity', 'nlp-long-gpt-mcq-likelihood', 'nlp-long-bert-entailment']) {
    assert.ok(long.some(q => q.id === id), id);
  }
});

test('written exam focus has substantial practice in every confirmed written topic', () => {
  const questions = subject.sets.flatMap(id => read(id.slice(4)).questions);
  const focus = questions.filter(q => q.lecture >= 5 && q.lecture <= 9 && ['written', 'numeric'].includes(q.type));
  assert.ok(focus.length >= 100, `only ${focus.length} questions`);
  for (const lecture of [5, 6, 7, 8, 9]) {
    assert.ok(focus.some(q => q.lecture === lecture && q.type === 'written'), `no L${lecture} written practice`);
  }
});
