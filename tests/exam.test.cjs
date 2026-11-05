// node --test "tests/*.test.cjs"
// The scope-exam generator (src/core/exam.js): exact marks per exam question (or the nearest total under it),
// one question per variantOf group and no id twice, no out-of-scope topic, the same code giving the same paper,
// the full sweep covering every topic, the repeat weighting, and the blueprint build checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const Quizy = require('./load.cjs');

const root = path.join(__dirname, '..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const DO = readJSON('data/subjects.json').subjects.find(s => s.key === 'do');
const DO_SETS = DO.sets.map(id => readJSON(Quizy.setFile('do', id)));
const hundredths = n => Math.round(n * 100);
const sum = items => items.reduce((total, x) => total + hundredths(Quizy.marksOf(x.q)), 0);
const allItems = paper => paper.questions.flatMap(x => x.items);
const CODES = Array.from({length: 60}, (_, i) => 1000 + i * 137);

// Everything that must hold for any scope exam or sweep.
function checkPaper(paper, subject) {
  const items = allItems(paper);
  assert.equal(new Set(items.map(x => x.q.id)).size, items.length, 'no question twice');
  const groups = items.map(x => x.q.variantOf).filter(Boolean);
  assert.equal(new Set(groups).size, groups.length, 'one question per variantOf group');
  const scope = Quizy.blueprintTopics(subject.examBlueprint);
  for (const x of items) assert.ok(scope.includes(Number(x.q.lecture)), `${x.q.id} is out of scope`);
  for (const question of paper.questions) {
    for (const x of question.items) assert.ok(question.topics.includes(Number(x.q.lecture)), `${x.q.id} not in ${question.label}'s topics`);
    assert.equal(hundredths(question.total), sum(question.items));
    assert.equal(hundredths(question.seenMarks), sum(question.items.filter(x => Quizy.originOf(x.set) === 'seen')));
  }
}

test('the DO blueprint is the real exam shape', () => {
  const b = DO.examBlueprint;
  assert.equal(b.totalMarks, 50);
  assert.deepEqual(b.questions.map(x => x.marks), [18, 20, 12]);
  assert.deepEqual(Quizy.blueprintTopics(b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(DO.topics['12'], 'Out of scope');
});

test('scope exam: every exam question exactly filled, 60–80% seen, no repeats, no topic 12', () => {
  for (const code of CODES) {
    const paper = Quizy.makeScopeExam({subject: DO, sets: DO_SETS, code});
    assert.equal(paper.ok, true);
    assert.equal(paper.kind, 'exam');
    checkPaper(paper, DO);
    assert.deepEqual(paper.questions.map(x => hundredths(x.total)), [1800, 2000, 1200], `code ${code}`);
    assert.equal(paper.questions.every(x => !x.short), true);
    assert.equal(paper.totalMarks, 50);
    for (const x of allItems(paper)) assert.notEqual(Number(x.q.lecture), 12);
    for (const question of paper.questions) {
      const f = question.seenMarks / question.total;
      assert.ok(f >= 0.6 - 1e-9 && f <= 0.8 + 1e-9, `code ${code} ${question.label}: seen share ${f}`);
    }
  }
});

test('scope exam: the same code replays the same paper; other codes differ', () => {
  const ids = paper => paper.questions.map(x => x.items.map(i => i.q.id));
  const a = Quizy.makeScopeExam({subject: DO, sets: DO_SETS, code: 4821});
  const b = Quizy.makeScopeExam({subject: DO, sets: DO_SETS, code: 4821});
  assert.deepEqual(ids(a), ids(b));
  assert.equal(a.random(), b.random(), 'the generator continues identically (option shuffles)');
  assert.equal(a.label, '4821');
  const others = new Set(CODES.map(code => JSON.stringify(ids(Quizy.makeScopeExam({subject: DO, sets: DO_SETS, code})))));
  assert.ok(others.size > CODES.length * 0.9, 'codes give different papers');
  const sweep = c => Quizy.makeScopeSweep({subject: DO, sets: DO_SETS, code: c});
  assert.deepEqual(ids(sweep(77)), ids(sweep(77)));
  assert.equal(sweep(77).label, 'S77');
});

test('full scope sweep: at least one question from every in-scope topic, never topic 12', () => {
  for (const code of CODES) {
    const paper = Quizy.makeScopeSweep({subject: DO, sets: DO_SETS, code});
    assert.equal(paper.kind, 'sweep');
    checkPaper(paper, DO);
    const topics = new Set(allItems(paper).map(x => Number(x.q.lecture)));
    assert.deepEqual([...topics].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], `code ${code}`);
    assert.equal(allItems(paper).length, 11, 'one question per topic');
    assert.equal(hundredths(paper.totalMarks), sum(allItems(paper)));
  }
});

test('scope exam: topics are spread within an exam question', () => {
  // Question 2 lists 7 topics; with 20 marks and 2–6 mark questions it should usually cover several.
  const counts = CODES.map(code => new Set(Quizy.makeScopeExam({subject: DO, sets: DO_SETS, code}).questions[1].items.map(x => x.q.lecture)).size);
  assert.ok(counts.every(n => n >= 3), `topics per Question 2: ${counts}`);
  assert.ok(counts.reduce((a, b) => a + b, 0) / counts.length >= 4.5);
});

// A made-up subject: topic 1 holds a question repeated 5 times (group "often"), one asked once, and filler;
// topic 12 is out of scope.
function weightingSubject() {
  const q = (id, lecture, marks, extra = {}) => ({id, lecture, marks, type: 'written', question: id, concept: 'c', ...extra});
  const seen = {id: 'w-past', kind: 'past-paper', questions: []};
  const fresh = {id: 'w-new', kind: 'generated', questions: []};
  for (let i = 0; i < 5; i++) seen.questions.push(q(`often-${i}`, 1, 2, {variantOf: 'often'}));
  seen.questions.push(q('once', 1, 2));
  for (let i = 0; i < 6; i++) seen.questions.push(q(`fill-${i}`, 1, 2));
  for (let i = 0; i < 6; i++) fresh.questions.push(q(`new-${i}`, 1, 2));
  for (let i = 0; i < 10; i++) seen.questions.push(q(`out-${i}`, 12, 2));
  const subject = {key: 'w', topics: {1: 'One', 12: 'Out of scope'},
    examBlueprint: {title: 'W exam', totalMarks: 10, questions: [{label: 'Question 1', marks: 10, topics: [1]}], seenShare: [0.6, 0.8]}};
  return {subject, sets: [seen, fresh]};
}

test('repeat weighting: a question the lecturer repeated is picked more often (seeded, 400 papers)', () => {
  const {subject, sets} = weightingSubject();
  let often = 0, once = 0;
  for (let code = 1; code <= 400; code++) {
    const paper = Quizy.makeScopeExam({subject, sets, code});
    checkPaper(paper, subject);
    const ids = allItems(paper).map(x => x.q.id);
    if (ids.some(id => id.startsWith('often-'))) often++;
    if (ids.includes('once')) once++;
  }
  // 4 of 8 seen candidates (by group) are drawn each time; weight 5 against 1 makes "often" near-certain.
  assert.ok(often > once * 1.4, `often ${often} vs once ${once}`);
  assert.ok(often > 330, `often ${often} / 400`);
});

test('nearest total under the marks when an exact fill is impossible', () => {
  const q = (id, marks) => ({id, lecture: 1, marks, type: 'written', question: id, concept: 'c'});
  const sets = [{id: 'x-past', kind: 'past-paper', questions: [q('a', 4), q('b', 4)]}, {id: 'x-new', kind: 'generated', questions: [q('c', 3)]}];
  const subject = {key: 'x', topics: {1: 'One'},
    examBlueprint: {title: 'X', totalMarks: 10, questions: [{label: 'Question 1', marks: 10, topics: [1]}], seenShare: [0.6, 0.8]}};
  const paper = Quizy.makeScopeExam({subject, sets, code: 5});
  assert.equal(paper.ok, true);
  const [question] = paper.questions;
  assert.equal(question.total, 8, 'reachable totals ≤ 10: 3, 4, 7, 8 (11 is too much)');
  assert.equal(question.short, true);
  assert.equal(paper.totalMarks, 8);
});

test('origin labels', () => {
  const set = id => DO_SETS.find(s => s.id === id);
  const find = id => DO_SETS.flatMap(s => s.questions).find(q => q.id === id);
  assert.equal(Quizy.originLabel(find('do-pt22-2c'), set('do-pt-2022')), 'from DOPT2022 Q2(c)');
  assert.equal(Quizy.originLabel(find('do-ex21-3b'), set('do-exam-2021')), 'from DOEXAM2021 Q3(b)');
  assert.equal(Quizy.originLabel(find('do-pt19-2b'), set('do-pt-2019')), 'from Test 2019 Q2(b)');
  assert.equal(Quizy.originLabel(find('do-ex24-1a'), set('do-2024-exam')), 'from 2024 Exam Q1(a)');
  assert.equal(Quizy.originLabel(find('do-old-apr13-3'), set('do-older-papers')), 'from April 2013 test Q3');
  assert.equal(Quizy.originLabel(find('do-tut2-2'), set('do-tut-2')), 'from Tut2 Q2');
  assert.equal(Quizy.originLabel(find('do-sb-qap-model'), set('do-scope-bank')), 'new practice question');
});

test('the scope bank covers every in-scope topic it was written for', () => {
  const bank = DO_SETS.find(s => s.id === 'do-scope-bank');
  assert.equal(bank.kind, 'generated');
  assert.equal(bank.unofficialAnswers, true);
  const count = t => bank.questions.filter(q => q.lecture === t).length;
  const minimum = {1: 3, 3: 5, 4: 2, 5: 4, 6: 6, 7: 3, 8: 3, 9: 2, 10: 4, 11: 4};
  for (const [t, n] of Object.entries(minimum)) assert.ok(count(Number(t)) >= n, `topic ${t}: ${count(Number(t))}`);
  for (const q of bank.questions) assert.ok(q.marks >= 2 && q.marks <= 6, q.id);
});

// The build rejects a broken blueprint (tools/build-data.cjs run on a scratch folder).
function build(examBlueprint) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizy-exam-'));
  fs.mkdirSync(path.join(dir, 'data', 'tt'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'generated'));
  fs.writeFileSync(path.join(dir, 'data', 'subjects.json'), JSON.stringify({subjects: [{key: 'tt', code: 'TT', name: 'Test', topics: {1: 'One', 2: 'Two'}, examBlueprint,
    theme: {accent: '#147d83', paper: '#f2f5f4', light: '#dbefee', aside: '#e8f0ef'}, sets: ['tt-one']}]}));
  fs.writeFileSync(path.join(dir, 'data', 'tt', 'one.json'), JSON.stringify({id: 'tt-one', subject: 'tt', title: 'One', kind: 'generated',
    questions: [{id: 'tt-1', lecture: 1, concept: 'c', type: 'single', question: 'Q?', choices: ['a', 'b'], answer: [0]}]}));
  const run = spawnSync(process.execPath, [path.join(root, 'tools', 'build-data.cjs'), dir], {encoding: 'utf8'});
  fs.rmSync(dir, {recursive: true, force: true});
  return {status: run.status, out: run.stdout + run.stderr};
}

test('build: examBlueprint is checked', () => {
  const good = {title: 'T', totalMarks: 10, questions: [{label: 'Q1', marks: 6, topics: [1]}, {label: 'Q2', marks: 4, topics: [1, 2]}], seenShare: [0.6, 0.8]};
  assert.equal(build(good).status, 0, build(good).out);
  assert.match(build({...good, totalMarks: 12}).out, /totalMarks is 12 but the questions add up to 10/);
  assert.match(build({...good, questions: [{label: 'Q1', marks: 10, topics: [3]}]}).out, /topic 3 has no name/);
  assert.match(build({...good, seenShare: [0.9, 0.1]}).out, /seenShare must be/);
  assert.match(build({...good, questions: []}).out, /questions must be a non-empty list/);
});
