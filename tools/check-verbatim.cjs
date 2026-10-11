// Check that source papers (kinds past-paper, practice-quiz and tutorial) reach the app verbatim: every
// question, choice, matching prompt, option and numeric part label string in generated/quizy-data.js
// must be byte-identical to its source JSON under data/.
// Run after node tools/build-data.cjs: node tools/check-verbatim.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sandbox = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'generated/quizy-data.js'), 'utf8'), sandbox);
const bundle = sandbox.window.QUIZY_DATA;
const VERBATIM_KINDS = new Set(['past-paper', 'practice-quiz', 'tutorial']);
const setFile = (subject, id) => `data/${subject}/${id.slice(subject.length + 1)}.json`;

// The exact strings a student reads, in a fixed order.
const strings = q => [
  q.question,
  ...(q.choices || []),
  ...(q.pairs || []).flatMap(p => [p.prompt, p.answer]),
  ...(q.options || []),
  ...(q.parts || []).map(p => p.label)
];

const errors = [];
let checked = 0;
for (const subject of readJSON('data/subjects.json').subjects) {
  for (const id of subject.sets) {
    const source = readJSON(setFile(subject.key, id));
    if (!VERBATIM_KINDS.has(source.kind)) continue;
    const bundled = bundle.sets[id];
    if (!bundled) { errors.push(`${id}: missing from the bundle`); continue; }
    if (bundled.questions.length !== source.questions.length) errors.push(`${id}: question count differs`);
    for (const q of source.questions) {
      const b = bundled.questions.find(x => x.id === q.id);
      if (!b) { errors.push(`${id} / ${q.id}: missing from the bundle`); continue; }
      const want = strings(q), got = strings(b);
      if (want.length !== got.length) errors.push(`${id} / ${q.id}: number of strings differs`);
      want.forEach((s, i) => {
        if (Buffer.compare(Buffer.from(s, 'utf8'), Buffer.from(got[i] ?? '', 'utf8')) !== 0) errors.push(`${id} / ${q.id}: string ${i} differs`);
        checked++;
      });
    }
  }
}

if (errors.length) {
  console.error(`Found ${errors.length} difference(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`Source papers are verbatim: ${checked} strings match data/.`);
