// Validate every quiz set and rebuild the local-file fallback (questions-data.js).
// Run after any change under data/: node build-data.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const TYPES = new Set(['single', 'truefalse', 'multi', 'match']);
const KINDS = new Set(['lecture-bank', 'past-paper', 'practice-quiz', 'tutorial', 'generated']);
const errors = [];
const fail = message => errors.push(message);
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const isText = value => typeof value === 'string' && value.length > 0;
const validIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
// A set with id "<subject>-<name>" lives in data/<subject>/<name>.json (app.js uses the same rule).
const setFile = (subject, id) => `data/${subject}/${id.slice(subject.length + 1)}.json`;

function checkWords(where, text, words) {
  if (!Array.isArray(words)) return fail(`${where}: emphasis must be an array`);
  for (const word of words) {
    if (!isText(word) || !text.includes(word)) fail(`${where}: emphasis "${word}" does not appear in the text`);
  }
}

function checkQuestion(q, set, ids) {
  const where = `${set.id} / ${q.id}`;
  if (!isText(q.id)) return fail(`${set.id}: a question is missing its id`);
  if (ids.has(q.id)) fail(`${where}: duplicate id (also in ${ids.get(q.id)})`);
  ids.set(q.id, set.id);
  if (!TYPES.has(q.type)) return fail(`${where}: unknown type "${q.type}"`);
  if (!isText(q.question)) fail(`${where}: missing question text`);
  if (q.lecture === undefined) fail(`${where}: missing lecture`);
  if (q.marks !== undefined && !(typeof q.marks === 'number' && q.marks > 0)) fail(`${where}: marks must be a positive number`);
  if (q.emphasis !== undefined && isText(q.question)) checkWords(where, q.question, q.emphasis);
  if (q.keyDispute !== undefined && !isText(q.keyDispute)) fail(`${where}: keyDispute must be text`);
  if (q.image !== undefined) {
    if (!isText(q.image.src) || !isText(q.image.alt)) fail(`${where}: image needs src and alt`);
    else if (!fs.existsSync(path.join(root, q.image.src))) fail(`${where}: image ${q.image.src} not found`);
  }
  if (set.kind === 'lecture-bank' && (!q.source?.file || !Array.isArray(q.source.pages) || !q.source.pages.length)) fail(`${where}: missing source`);

  if (q.type === 'match') {
    if (!Array.isArray(q.pairs) || !q.pairs.length) return fail(`${where}: match needs pairs`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) return fail(`${where}: match needs at least two options`);
    for (const pair of q.pairs) {
      if (!isText(pair.prompt)) fail(`${where}: a pair is missing its prompt`);
      if (!q.options.includes(pair.answer)) fail(`${where}: pair answer "${pair.answer}" is not in options`);
    }
    return;
  }
  if (!Array.isArray(q.choices) || q.choices.length < 2 || !q.choices.every(isText)) return fail(`${where}: needs at least two text choices`);
  if (!Array.isArray(q.answer) || !q.answer.length) return fail(`${where}: answer must be a non-empty array of indices`);
  if (!q.answer.every(i => validIndex(i, q.choices))) fail(`${where}: answer index out of range`);
  if (new Set(q.answer).size !== q.answer.length) fail(`${where}: repeated answer index`);
  if (q.type !== 'multi' && q.answer.length !== 1) fail(`${where}: ${q.type} must have exactly one answer`);
  if (q.type === 'truefalse' && JSON.stringify(q.choices) !== '["True","False"]') fail(`${where}: truefalse choices must be exactly ["True","False"]`);
  if (q.emphasisInChoices !== undefined) {
    for (const [i, words] of Object.entries(q.emphasisInChoices)) {
      if (!validIndex(Number(i), q.choices)) fail(`${where}: emphasisInChoices index ${i} out of range`);
      else checkWords(`${where} choice ${i}`, q.choices[Number(i)], words);
    }
  }
}

const registry = readJSON('data/subjects.json');
const sets = {};
const ids = new Map();
const report = [];
const subjectKeys = new Set();
for (const subject of registry.subjects) {
  if (!isText(subject.key) || subjectKeys.has(subject.key)) fail(`Subject keys must be unique text (${subject.key})`);
  subjectKeys.add(subject.key);
  for (const token of ['accent', 'paper', 'light', 'aside']) {
    if (!/^#[0-9a-f]{6}$/i.test(subject.theme?.[token] || '')) fail(`${subject.key}: theme.${token} must be a #rrggbb colour`);
  }
  let questionCount = 0, markCount = 0;
  for (const id of subject.sets) {
    if (!id.startsWith(subject.key + '-')) { fail(`${subject.key}: set id "${id}" must start with "${subject.key}-"`); continue; }
    const file = setFile(subject.key, id);
    if (!fs.existsSync(path.join(root, file))) { fail(`${id}: expected file ${file}`); continue; }
    const set = readJSON(file);
    if (set.id !== id) fail(`${file}: id is "${set.id}", expected "${id}"`);
    if (set.subject !== subject.key) fail(`${file}: subject is "${set.subject}", expected "${subject.key}"`);
    if (!isText(set.title)) fail(`${file}: missing title`);
    if (!KINDS.has(set.kind)) fail(`${file}: unknown kind "${set.kind}"`);
    if (!Array.isArray(set.questions)) { fail(`${file}: questions must be an array`); continue; }
    for (const q of set.questions) checkQuestion(q, set, ids);
    const marks = set.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
    if (set.totalMarks !== undefined && set.totalMarks !== marks) fail(`${file}: totalMarks is ${set.totalMarks} but the questions add up to ${marks}`);
    sets[id] = set;
    questionCount += set.questions.length;
    markCount += marks;
  }
  report.push(`  ${subject.key.toUpperCase().padEnd(4)} ${String(subject.sets.length).padStart(2)} set(s) · ${String(questionCount).padStart(3)} questions · ${markCount} marks`);
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const data = {subjects: registry.subjects, sets};
fs.writeFileSync(path.join(root, 'questions-data.js'), '// Generated by build-data.cjs from data/. Do not edit this file.\nwindow.QUIZY_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(`Bundled ${ids.size} questions into questions-data.js:\n${report.join('\n')}`);
