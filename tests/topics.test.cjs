// node --test "tests/*.test.cjs"
// Topic names for lecture numbers (subjects.json "topics", used by DO) and the answerImage field:
// the labels, the DO source labels, and the build checks (tools/build-data.cjs run on a scratch folder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const Quizy = require('./load.cjs');

const DO = {key: 'do', topics: {1: 'Network flow', 5: 'Assignment', 6: 'Clique'}};

test('lecture names: topic names when the subject has them, L<n> otherwise', () => {
  assert.equal(Quizy.lectureName(1, DO), 'Network flow');
  assert.equal(Quizy.lectureName('5', DO), 'Assignment');
  assert.equal(Quizy.lectureName(7, DO), 'L7', 'a lecture without a name falls back');
  assert.equal(Quizy.lectureName(7, {key: 'nlp'}), 'L7');
  assert.equal(Quizy.lectureName(7), 'L7');
  assert.equal(Quizy.lectureLabel(['6', '1', '5'], DO), 'Network flow, Assignment, Clique');
  assert.equal(Quizy.lectureLabel([], DO), 'all topics');
  // Unchanged without topics (DVE, NLP).
  assert.equal(Quizy.lectureLabel(['8', '5', '6', '7'], {key: 'nlp'}), 'L5–L8');
  assert.equal(Quizy.lectureLabel([], {key: 'nlp'}), 'all lectures');
});

test('source labels for DO questions ({number} or {paper, number})', () => {
  assert.equal(Quizy.sourceLabel({source: {number: '1(c)'}}, {kind: 'past-paper'}), 'Paper Q1(c)');
  assert.equal(Quizy.sourceLabel({source: {number: '2'}}, {kind: 'tutorial'}), 'Tutorial Q2');
  assert.equal(Quizy.sourceLabel({source: {paper: 'April 2013 test', number: '3'}}, {kind: 'past-paper'}), 'April 2013 test Q3');
});

test('the real DO subject names every lecture its questions use', () => {
  const root = path.join(__dirname, '..');
  const subjects = JSON.parse(fs.readFileSync(path.join(root, 'data', 'subjects.json'), 'utf8')).subjects;
  const subject = subjects.find(s => s.key === 'do');
  for (const id of subject.sets) {
    const set = JSON.parse(fs.readFileSync(path.join(root, Quizy.setFile('do', id)), 'utf8'));
    for (const q of set.questions) assert.ok(subject.topics[String(q.lecture)], q.id);
  }
  assert.equal(subjects.find(s => s.key === 'nlp').topics, undefined, 'NLP keeps L<n> chips');
});

// A scratch folder laid out like the repo with one subject and one question.
function build({topics, lecture = 1, answerImage, makeImage = true} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizy-topics-'));
  fs.mkdirSync(path.join(dir, 'data', 'tt', 'img'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'generated'));
  if (makeImage) fs.writeFileSync(path.join(dir, 'data', 'tt', 'img', 'a.png'), 'png');
  fs.writeFileSync(path.join(dir, 'data', 'subjects.json'), JSON.stringify({subjects: [{key: 'tt', code: 'TT', name: 'Test', topics,
    theme: {accent: '#147d83', paper: '#f2f5f4', light: '#dbefee', aside: '#e8f0ef'}, sets: ['tt-one']}]}));
  fs.writeFileSync(path.join(dir, 'data', 'tt', 'one.json'), JSON.stringify({id: 'tt-one', subject: 'tt', title: 'One', kind: 'generated',
    questions: [{id: 'tt-1', lecture, concept: 'c', type: 'single', question: 'Q?', choices: ['a', 'b'], answer: [0], answerImage}]}));
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-data.cjs'), dir], {encoding: 'utf8'});
  fs.rmSync(dir, {recursive: true, force: true});
  return {status: run.status, out: run.stdout + run.stderr};
}

test('build: topics must name every lecture used', () => {
  assert.equal(build({topics: {1: 'Network flow'}}).status, 0);
  const missing = build({topics: {2: 'Other'}});
  assert.equal(missing.status, 1);
  assert.match(missing.out, /tt-one \/ tt-1: lecture 1 has no name in tt\.topics/);
  assert.match(build({topics: {1: ''}}).out, /topics\.1 must be a name/);
  assert.match(build({topics: ['Network flow']}).out, /topics must be an object/);
});

test('build: answerImage needs an existing file and alt text', () => {
  const src = 'data/tt/img/a.png';
  assert.equal(build({answerImage: {src, alt: 'The answer.'}}).status, 0);
  const gone = build({answerImage: {src, alt: 'The answer.'}, makeImage: false});
  assert.equal(gone.status, 1);
  assert.match(gone.out, /tt-one \/ tt-1: answerImage data\/tt\/img\/a\.png not found/);
  assert.match(build({answerImage: {src, alt: ''}}).out, /answerImage needs src and alt/);
  assert.match(build({answerImage: 'a.png'}).out, /answerImage needs src and alt/);
});
