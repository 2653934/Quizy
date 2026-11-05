// Validate every quiz set and rebuild the local-file fallback (generated/quizy-data.js).
// Run after any change under data/: node tools/build-data.cjs
const fs = require('node:fs');
const path = require('node:path');

// The repo, or another folder with the same layout (data/, generated/): node tools/build-data.cjs <folder> (used by the tests).
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
// The app's own Node-safe code: helpers, marks, the set file rule, the paper fields and the question types (every file in src/types/).
// Each type validates its own fields; this script keeps the checks that span questions and sets.
require('../src/core/random.js');
require('../src/core/util.js');
require('../src/core/math.js');
require('../src/core/scoring.js');
const Quizy = require('../src/core/data.js');
require('../src/core/paper.js');
require('../src/core/exam.js');
require('../src/core/search.js');
require('../src/core/reference.js');
require('../src/types/registry.js');
const types = path.join(__dirname, '..', 'src', 'types');
for (const file of fs.readdirSync(types).sort()) require(path.join(types, file));
const {setFile} = Quizy;
const {isText, checkWords} = Quizy.typeHelpers;
// The vendored KaTeX (UMD build) checks every formula once, as the app will draw it.
const katex = require('../vendor/katex/katex.min.js');

const KINDS = new Set(['lecture-bank', 'past-paper', 'practice-quiz', 'tutorial', 'generated']);
const errors = [];
const fail = message => errors.push(message);
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

function checkQuestion(q, set, ids) {
  const where = `${set.id} / ${q.id}`;
  if (!isText(q.id)) return fail(`${set.id}: a question is missing its id`);
  if (ids.has(q.id)) fail(`${where}: duplicate id (also in ${ids.get(q.id)})`);
  ids.set(q.id, set.id);
  const type = Object.hasOwn(Quizy.types, q.type) ? Quizy.types[q.type] : null;
  if (!type) return fail(`${where}: unknown type "${q.type}"`);
  if (!isText(q.question)) fail(`${where}: missing question text`);
  if (q.lecture === undefined) fail(`${where}: missing lecture`);
  if (q.marks !== undefined && !(typeof q.marks === 'number' && q.marks > 0)) fail(`${where}: marks must be a positive number`);
  if (q.emphasis !== undefined && isText(q.question)) checkWords(where, q.question, q.emphasis, fail);
  if (q.keyDispute !== undefined && !isText(q.keyDispute)) fail(`${where}: keyDispute must be text`);
  for (const field of ['image', 'answerImage']) {
    const image = q[field];
    if (image === undefined) continue;
    if (!isText(image?.src) || !isText(image?.alt)) fail(`${where}: ${field} needs src and alt`);
    else if (!fs.existsSync(path.join(root, image.src))) fail(`${where}: ${field} ${image.src} not found`);
  }
  if (set.kind === 'lecture-bank' && (!q.source?.file || !Array.isArray(q.source.pages) || !q.source.pages.length)) fail(`${where}: missing source`);
  type.validate(q, set, fail);
  for (const [field, text] of Quizy.shownFields(q)) checkMath(`${where} ${field}`, text);
}

// $…$ / $$…$$ maths: balanced, and every formula parses (src/core/math.js).
function checkMath(where, text) {
  for (const problem of Quizy.checkMath(text, katex)) fail(`${where}: ${problem}`);
}

const registry = readJSON('data/subjects.json');
const sets = {};
const references = {};
const ids = new Map();
const report = [];
const subjectKeys = new Set();
for (const subject of registry.subjects) {
  if (!isText(subject.key) || subjectKeys.has(subject.key)) fail(`Subject keys must be unique text (${subject.key})`);
  subjectKeys.add(subject.key);
  for (const token of ['accent', 'paper', 'light', 'aside']) {
    if (!/^#[0-9a-f]{6}$/i.test(subject.theme?.[token] || '')) fail(`${subject.key}: theme.${token} must be a #rrggbb colour`);
  }
  // Optional topic names for the lecture numbers ({"1": "Network flow", …}): shown instead of "L1".
  if (subject.topics !== undefined) {
    if (!subject.topics || typeof subject.topics !== 'object' || Array.isArray(subject.topics)) fail(`${subject.key}: topics must be an object of names`);
    else for (const [n, name] of Object.entries(subject.topics)) if (!isText(name)) fail(`${subject.key}: topics.${n} must be a name`);
  }
  Quizy.checkExamBlueprint(subject, fail);
  let questionCount = 0, markCount = 0;
  for (const id of subject.sets) {
    if (!id.startsWith(subject.key + '-')) { fail(`${subject.key}: set id "${id}" must start with "${subject.key}-"`); continue; }
    const file = setFile(subject.key, id);
    if (!fs.existsSync(path.join(root, file))) { fail(`${id}: expected file ${file}`); continue; }
    const set = readJSON(file);
    if (set.id !== id) fail(`${file}: id is "${set.id}", expected "${id}"`);
    if (set.subject !== subject.key) fail(`${file}: subject is "${set.subject}", expected "${subject.key}"`);
    if (!isText(set.title)) fail(`${file}: missing title`);
    if (set.description !== undefined) checkMath(`${id} description`, set.description);
    if (!KINDS.has(set.kind)) fail(`${file}: unknown kind "${set.kind}"`);
    if (set.unofficialAnswers !== undefined && typeof set.unofficialAnswers !== 'boolean') fail(`${file}: unofficialAnswers must be true or false`);
    if (!Array.isArray(set.questions)) { fail(`${file}: questions must be an array`); continue; }
    for (const q of set.questions) checkQuestion(q, set, ids);
    if (subject.topics && typeof subject.topics === 'object') {
      for (const q of set.questions) if (q.lecture !== undefined && !isText(subject.topics[String(q.lecture)])) fail(`${id} / ${q.id}: lecture ${q.lecture} has no name in ${subject.key}.topics`);
    }
    Quizy.checkPaperFields(set, fail);
    const marks = set.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
    if (set.totalMarks !== undefined && set.totalMarks !== marks) fail(`${file}: totalMarks is ${set.totalMarks} but the questions add up to ${marks}`);
    sets[id] = set;
    questionCount += set.questions.length;
    markCount += marks;
  }
  report.push(`  ${subject.key.toUpperCase().padEnd(4)} ${String(subject.sets.length).padStart(2)} set(s) · ${String(questionCount).padStart(3)} questions · ${markCount} marks`);
  // Optional model sheet ("reference": "<subject>-reference" → data/<subject>/reference.json, the set file rule).
  if (subject.reference !== undefined) {
    if (!isText(subject.reference) || !subject.reference.startsWith(subject.key + '-')) { fail(`${subject.key}: reference must be an id starting with "${subject.key}-"`); continue; }
    const file = setFile(subject.key, subject.reference);
    if (!fs.existsSync(path.join(root, file))) { fail(`${subject.reference}: expected file ${file}`); continue; }
    const ref = readJSON(file);
    Quizy.checkReference(ref, subject, fail, src => fs.existsSync(path.join(root, src)));
    if (ref.description !== undefined) checkMath(`${subject.reference} description`, ref.description);
    for (const card of Array.isArray(ref.cards) ? ref.cards : []) {
      const where = `${subject.reference} / ${card?.id}`;
      for (const [field, text] of Quizy.referenceTexts(card || {})) checkMath(`${where} ${field}`, text);
      for (const [field, tex] of Quizy.referenceFormulas(card || {})) {
        if (tex.includes('$')) fail(`${where} ${field}: write the formula without $ signs`);
        else checkMath(`${where} ${field}`, `$$${tex}$$`);
      }
    }
    references[subject.reference] = ref;
    report.push(`       model sheet · ${Array.isArray(ref.cards) ? ref.cards.length : 0} cards`);
  }
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const data = {subjects: registry.subjects, sets, references};
fs.writeFileSync(path.join(root, 'generated/quizy-data.js'), '// Generated by tools/build-data.cjs from data/. Do not edit this file.\nwindow.QUIZY_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(`Bundled ${ids.size} questions into generated/quizy-data.js:\n${report.join('\n')}`);
