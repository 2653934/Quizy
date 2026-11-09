// node --test "tests/*.test.cjs"
// The model sheet (src/core/reference.js): card validation, its shown texts and formulas, the sheet search,
// the real DO and NLP reference files, and the build checks (tools/build-data.cjs run on a scratch folder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const Quizy = require('./load.cjs');

const root = path.join(__dirname, '..');
const SUBJECT = {key: 'tt', reference: 'tt-reference', topics: {1: 'Network flow', 2: 'Señal', 12: 'Out of scope'}};

const modelCard = () => ({
  id: 'ref-flow', topic: 1, title: 'Max-flow model', kind: 'model', summary: 'Send as much as possible from $s$ to $t$.',
  model: {
    variables: [{math: 'x_{ij}', meaning: 'flow on arc $(i,j)$'}],
    objective: '\\max F',
    constraints: [{math: '0 \\le x_{ij} \\le u_{ij}', meaning: 'capacity'}]
  },
  points: ['Skew-symmetry: $f(i,j) = -f(j,i)$.'], images: [], source: 'DisCopt.pdf p. 7 (§1.2)'
});
const reference = cards => ({id: 'tt-reference', subject: 'tt', title: 'Sheet', scopeTopics: [1, 2], cards});

function problems(ref, subject = SUBJECT, exists) {
  const out = [];
  Quizy.checkReference(ref, subject, message => out.push(message), exists);
  return out;
}

test('a valid reference passes', () => {
  const algorithm = {id: 'ref-ff', topic: 2, title: 'Ford–Fulkerson', kind: 'algorithm', summary: 'Augment.', steps: ['Start with $x = 0$.'],
    images: [{src: 'data/tt/img/a.png', alt: 'A network.', width: 400, height: 300}], example: 'Flow 9.', source: 'NetworkFlowP.pdf p. 9'};
  const concept = {id: 'ref-other', topic: 12, title: 'Set cover', kind: 'concept', summary: 'Cover.', images: [], source: 'DisCopt.pdf p. 30'};
  assert.deepEqual(problems(reference([modelCard(), algorithm, concept])), []);
});

test('the reference header: id, subject, title, scope topics', () => {
  const out = problems({...reference([modelCard()]), id: 'tt-other', subject: 'xx', title: '', scopeTopics: [1, 5]});
  for (const pattern of [/id is "tt-other", expected "tt-reference"/, /subject is "xx"/, /missing title/, /scope topic 5 has no name/]) {
    assert.ok(out.some(m => pattern.test(m)), pattern);
  }
  assert.match(problems({...reference([modelCard()]), scopeTopics: []}).join(), /scopeTopics must list/);
  assert.match(problems(reference([])).join(), /cards must be a non-empty array/);
});

test('card checks: id, topic, kind, texts, model, steps, images', () => {
  const bad = (change, pattern) => {
    const card = {...modelCard(), ...change};
    assert.match(problems(reference([card])).join('\n'), pattern, JSON.stringify(change));
  };
  bad({id: ''}, /missing id/);
  bad({id: 'Ref Flow'}, /id may only use/);
  bad({topic: 3}, /topic 3 has no name/);
  bad({topic: '1'}, /topic 1 has no name/);
  bad({kind: 'table'}, /kind must be model, algorithm, concept/);
  bad({summary: ' '}, /missing summary/);
  bad({source: undefined}, /missing source/);
  bad({title: undefined}, /missing title/);
  bad({example: ''}, /example must be text/);
  bad({points: []}, /points must be a non-empty list/);
  bad({steps: ['ok', '']}, /steps must be a non-empty list/);
  bad({model: undefined}, /a model card needs a model/);
  bad({model: {variables: [], objective: 'x', constraints: [{math: 'x', meaning: 'm'}]}}, /model\.variables must be a non-empty list/);
  bad({model: {variables: [{math: 'x'}], objective: 'x', constraints: [{math: 'x', meaning: 'm'}]}}, /variables\[0\] needs math and meaning/);
  bad({model: {variables: [{math: 'x', meaning: 'm'}], objective: '', constraints: [{math: 'x', meaning: 'm'}]}}, /objective must be a formula/);
  bad({model: {variables: [{math: 'x', meaning: 'm'}], objective: 'x', constraints: []}}, /constraints must be a non-empty list/);
  bad({kind: 'algorithm', model: undefined}, /an algorithm card needs steps/);
  bad({images: undefined}, /images must be a list/);
  bad({images: [{src: 'a.png'}]}, /images\[0\] needs src and alt/);
  assert.match(problems(reference([{...modelCard(), images: [{src: 'gone.png', alt: 'x', width: 1, height: 1}]}]), SUBJECT, () => false).join(), /images\[0\] gone\.png not found/);
  bad({images: [{src: 'a.png', alt: 'x', width: 10}]}, /images\[0\] needs its width and height/);
  bad({images: [{src: 'a.png', alt: 'x', width: 10, height: 2.5}]}, /images\[0\] needs its width and height/);
  assert.match(problems(reference([modelCard(), modelCard()])).join(), /ref-flow: duplicate id/);
});

test('shown texts and formulas of a card', () => {
  const card = {...modelCard(), steps: ['s1'], example: 'e'};
  assert.deepEqual(Quizy.referenceTexts(card).map(([field]) => field),
    ['title', 'summary', 'model.variables.meaning[0]', 'model.constraints.meaning[0]', 'steps[0]', 'points[0]', 'example', 'source']);
  assert.deepEqual(Quizy.referenceFormulas(card), [['model.variables[0].math', 'x_{ij}'], ['model.objective', '\\max F'], ['model.constraints[0].math', '0 \\le x_{ij} \\le u_{ij}']]);
  assert.deepEqual(Quizy.referenceFormulas({id: 'c'}), []);
});

test('sheet search: every term, case and accents ignored, formulas as plain text, topic names', () => {
  const card = modelCard();
  const match = query => Quizy.cardMatches(card, Quizy.searchTerms(query), SUBJECT);
  assert.ok(match(''));
  assert.ok(match('MAX-FLOW'));
  assert.ok(match('skew symmetry'));
  assert.ok(match('network flow'), 'the topic name');
  assert.ok(match('disCopt §1.2'), 'the source');
  assert.ok(match('uᵢⱼ'), 'formula text (Quizy.mathToPlain)');
  assert.ok(match('max f'), 'the objective');
  assert.ok(!match('max bisection'));
  const accented = {...modelCard(), id: 'ref-s', topic: 2};
  assert.ok(Quizy.cardMatches(accented, Quizy.searchTerms('senal'), SUBJECT), 'accents folded in the topic name');
});

test('the real DO model sheet: every scope topic has a card, every image is used, sources given', () => {
  const subjects = JSON.parse(fs.readFileSync(path.join(root, 'data', 'subjects.json'), 'utf8')).subjects;
  const subject = subjects.find(s => s.key === 'do');
  assert.equal(subject.reference, 'do-reference');
  const ref = JSON.parse(fs.readFileSync(path.join(root, Quizy.setFile('do', subject.reference)), 'utf8'));
  assert.deepEqual(problems(ref, subject, src => fs.existsSync(path.join(root, src))), []);
  assert.deepEqual(ref.scopeTopics, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const n of ref.scopeTopics) assert.ok(ref.cards.some(c => c.topic === n), `topic ${n}`);
  const used = new Set(ref.cards.flatMap(c => c.images.map(i => path.basename(i.src))));
  for (const file of fs.readdirSync(path.join(root, 'data', 'do', 'img', 'reference'))) assert.ok(used.has(file), file);
  // The stored sizes are the PNGs' own (read from the IHDR chunk).
  for (const image of ref.cards.flatMap(c => c.images)) {
    const png = fs.readFileSync(path.join(root, image.src));
    assert.deepEqual([image.width, image.height], [png.readUInt32BE(16), png.readUInt32BE(20)], image.src);
  }
  // The notes' max-bisection, word for word in the formula.
  const bisection = ref.cards.find(c => c.id === 'ref-bisection');
  assert.ok(bisection.model.objective.includes('\\frac{1}{4} \\sum_{i=1}^n \\sum_{j=1}^n w_{ij}\\,(1 - x_i x_j)'));
  for (const s of subjects) if (!['do', 'nlp'].includes(s.key)) assert.equal(s.reference, undefined, `${s.key} has no model sheet`);
});

test('a subject without topic names uses lecture numbers; topicTitles name the sections', () => {
  const lectures = {key: 'tt', reference: 'tt-reference'};
  const card = {...modelCard(), topic: 5};
  const ref = {...reference([card]), scopeTopics: [1, 5], topicTitles: {5: 'Language modelling'}};
  assert.deepEqual(problems(ref, lectures), []);
  const out = problems({...ref, scopeTopics: [0, 1.5], cards: [{...card, topic: '5'}]}, lectures).join('\n');
  assert.match(out, /scope topic 0 must be a lecture number/);
  assert.match(out, /scope topic 1.5 must be a lecture number/);
  assert.match(out, /topic 5 must be a lecture number/);
  assert.match(problems({...ref, topicTitles: {7: 'Transformers'}}, lectures).join(), /topicTitles\["7"\] is not a scope topic/);
  assert.match(problems({...ref, topicTitles: {5: ' '}}, lectures).join(), /topicTitles\["5"\] must be text/);
  assert.match(problems({...ref, topicTitles: ['x']}, lectures).join(), /topicTitles must be an object/);
  assert.deepEqual(problems({...ref, searchHint: 'attention, LoRA'}, lectures), []);
  assert.match(problems({...ref, searchHint: ''}, lectures).join(), /searchHint must be text/);
  // With topic names (DO), a number alone is not enough.
  assert.match(problems({...reference([{...modelCard(), topic: 3}])}).join(), /topic 3 has no name in tt\.topics/);
});

test('the real NLP model sheet: lectures 1–10, every image used once, sources, the Test 2 card', () => {
  const subjects = JSON.parse(fs.readFileSync(path.join(root, 'data', 'subjects.json'), 'utf8')).subjects;
  const subject = subjects.find(s => s.key === 'nlp');
  assert.equal(subject.reference, 'nlp-reference');
  assert.equal(subject.topics, undefined, 'NLP keeps its L1–L10 lecture chips');
  const ref = JSON.parse(fs.readFileSync(path.join(root, Quizy.setFile('nlp', subject.reference)), 'utf8'));
  assert.deepEqual(problems(ref, subject, src => fs.existsSync(path.join(root, src))), []);
  assert.deepEqual(ref.scopeTopics, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const n of ref.scopeTopics) {
    assert.ok(ref.cards.some(c => c.topic === n), `lecture ${n} has a card`);
    assert.ok(ref.topicTitles[String(n)], `lecture ${n} has a section title`);
  }
  // Every diagram in the folder is used by exactly one card, at its real pixel size.
  const images = ref.cards.flatMap(c => c.images);
  const files = fs.readdirSync(path.join(root, 'data', 'nlp', 'img', 'reference'));
  assert.deepEqual(images.map(i => path.basename(i.src)).sort(), [...files].sort());
  for (const image of images) {
    const bytes = fs.readFileSync(path.join(root, image.src));
    if (image.src.endsWith('.svg')) {
      const svg = bytes.toString('utf8');
      const size = svg.match(/<svg\b[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
      assert.ok(size, `${image.src} has explicit dimensions`);
      assert.deepEqual([image.width, image.height], [Number(size[1]), Number(size[2])], image.src);
    } else {
      assert.deepEqual([image.width, image.height], [bytes.readUInt32BE(16), bytes.readUInt32BE(20)], image.src);
    }
  }
  // Card ids are unique across every sheet, so a #ref= link finds one subject.
  const doRef = JSON.parse(fs.readFileSync(path.join(root, 'data', 'do', 'reference.json'), 'utf8'));
  const doIds = new Set(doRef.cards.map(c => c.id));
  for (const c of ref.cards) assert.ok(!doIds.has(c.id), `${c.id} is also a DO card`);
  // The bookmarked Test 2 card: an algorithm with the 10-point answer, labelled as a recollection.
  const mcq = ref.cards.find(c => c.id === 'nlp-gpt2-mcq');
  assert.equal(mcq.topic, 8);
  assert.equal(mcq.kind, 'algorithm');
  assert.equal(mcq.steps.length, 10);
  assert.match(mcq.source, /recalled from Test 2.*not the official wording/);
  assert.match(mcq.source, /lecture8_transfer_learning\.pdf p\. 56/);
  for (const c of ref.cards) assert.match(c.source, /lecture\d+_|HTML deck|not from the slides|scope announcement|recalled/, c.id);
});

// A scratch folder laid out like the repo with one subject, one set and a model sheet.
function build(card, {reference: id = 'tt-reference'} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizy-reference-'));
  fs.mkdirSync(path.join(dir, 'data', 'tt'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'generated'));
  fs.writeFileSync(path.join(dir, 'data', 'subjects.json'), JSON.stringify({subjects: [{key: 'tt', code: 'TT', name: 'Test', topics: {1: 'Flow', 2: 'Other'}, reference: id,
    theme: {accent: '#147d83', paper: '#f2f5f4', light: '#dbefee', aside: '#e8f0ef'}, sets: ['tt-one']}]}));
  fs.writeFileSync(path.join(dir, 'data', 'tt', 'one.json'), JSON.stringify({id: 'tt-one', subject: 'tt', title: 'One', kind: 'generated',
    questions: [{id: 'tt-1', lecture: 1, concept: 'c', type: 'single', question: 'Q?', choices: ['a', 'b'], answer: [0]}]}));
  fs.writeFileSync(path.join(dir, 'data', 'tt', 'reference.json'), JSON.stringify(reference([card])));
  const run = spawnSync(process.execPath, [path.join(root, 'tools', 'build-data.cjs'), dir], {encoding: 'utf8'});
  const bundle = run.status === 0 ? fs.readFileSync(path.join(dir, 'generated', 'quizy-data.js'), 'utf8') : '';
  fs.rmSync(dir, {recursive: true, force: true});
  return {status: run.status, out: run.stdout + run.stderr, bundle};
}

test('build: bundles the model sheet and checks its maths', () => {
  const ok = build(modelCard());
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /model sheet · 1 cards/);
  assert.match(ok.bundle, /"references": \{\s*"tt-reference"/);
  const badFormula = build({...modelCard(), model: {...modelCard().model, objective: '\\max \\frac{1}{'}});
  assert.equal(badFormula.status, 1);
  assert.match(badFormula.out, /tt-reference \/ ref-flow model\.objective/);
  assert.match(build({...modelCard(), model: {...modelCard().model, objective: '$\\max F$'}}).out, /without \$ signs/);
  assert.match(build({...modelCard(), summary: 'Unbalanced $x'}).out, /tt-reference \/ ref-flow summary/);
  assert.match(build({...modelCard(), topic: 9}).out, /topic 9 has no name/);
  assert.match(build(modelCard(), {reference: 'xx-sheet'}).out, /reference must be an id starting with "tt-"/);
  assert.match(build(modelCard(), {reference: 'tt-missing'}).out, /tt-missing: expected file data\/tt\/missing\.json/);
});
