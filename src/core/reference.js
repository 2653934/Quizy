'use strict';

// The model sheet (data/<subject>/reference.json, see src/ui/reference.js): card validation for
// tools/build-data.cjs and the sheet's search. Pure and Node-safe.
//
// A card: {id, topic, title, kind: "model" | "algorithm" | "concept", summary,
//   model?: {variables: [{math, meaning}], objective, constraints: [{math, meaning}]},
//   steps?: [text], points?: [text], images: [{src, alt, width, height}], example?, source}
// An image's width and height (its pixel size) let the page reserve its space before it loads.
// `math` and `objective` are bare LaTeX (drawn as formulas); every other text may hold $…$ maths.
// A card's topic is a topic named in the subject's `topics` (DO) or, for a subject without them (NLP), a
// lecture number (shown as "L5"). The optional `topicTitles` ({"5": "Language modelling"}) only adds a
// title to a scope topic's section heading on the sheet ("L5 · Language modelling"). The optional `searchHint`
// ("subtour, Metropolis") is shown in the search box as "e.g. …".
(function (Quizy) {
  Quizy.REFERENCE_KINDS = ['model', 'algorithm', 'concept'];

  const isText = value => typeof value === 'string' && value.trim() !== '';

  // [field, text] for every shown text of a card (maths as $…$), in the order the card shows them.
  Quizy.referenceTexts = function (card) {
    const texts = [];
    const add = (name, value) => { if (typeof value === 'string') texts.push([name, value]); };
    const list = (name, values, f = x => x) => { if (Array.isArray(values)) values.forEach((v, i) => add(`${name}[${i}]`, f(v))); };
    add('title', card.title);
    add('summary', card.summary);
    list('model.variables.meaning', card.model?.variables, v => v?.meaning);
    list('model.constraints.meaning', card.model?.constraints, c => c?.meaning);
    list('steps', card.steps);
    list('points', card.points);
    add('example', card.example);
    add('source', card.source);
    return texts;
  };

  // [field, latex] for the card's bare formulas (variables, objective, constraints).
  Quizy.referenceFormulas = function (card) {
    const formulas = [];
    const model = card.model;
    if (!model) return formulas;
    if (Array.isArray(model.variables)) model.variables.forEach((v, i) => { if (typeof v?.math === 'string') formulas.push([`model.variables[${i}].math`, v.math]); });
    if (typeof model.objective === 'string') formulas.push(['model.objective', model.objective]);
    if (Array.isArray(model.constraints)) model.constraints.forEach((c, i) => { if (typeof c?.math === 'string') formulas.push([`model.constraints[${i}].math`, c.math]); });
    return formulas;
  };

  // Checks a reference file against its subject. exists(src) says whether an image file is there.
  // The maths itself is checked by tools/build-data.cjs with KaTeX.
  Quizy.checkReference = function (ref, subject, fail, exists = () => true) {
    const where = ref?.id || subject.reference;
    if (!ref || typeof ref !== 'object') return fail(`${subject.reference}: not an object`);
    if (ref.id !== subject.reference) fail(`${where}: id is "${ref.id}", expected "${subject.reference}"`);
    if (ref.subject !== subject.key) fail(`${where}: subject is "${ref.subject}", expected "${subject.key}"`);
    if (!isText(ref.title)) fail(`${where}: missing title`);
    const named = n => subject.topics ? isText(subject.topics[String(n)]) : Number.isInteger(n) && n > 0;
    if (!Array.isArray(ref.scopeTopics) || !ref.scopeTopics.length) fail(`${where}: scopeTopics must list the topics to show as chips`);
    else for (const n of ref.scopeTopics) if (!named(n)) fail(subject.topics ? `${where}: scope topic ${n} has no name in ${subject.key}.topics` : `${where}: scope topic ${n} must be a lecture number`);
    if (ref.extraTitle !== undefined && !isText(ref.extraTitle)) fail(`${where}: extraTitle must be text`);
    if (ref.searchHint !== undefined && !isText(ref.searchHint)) fail(`${where}: searchHint must be text`);
    if (ref.topicTitles !== undefined) {
      if (!ref.topicTitles || typeof ref.topicTitles !== 'object' || Array.isArray(ref.topicTitles)) fail(`${where}: topicTitles must be an object`);
      else for (const [n, title] of Object.entries(ref.topicTitles)) {
        if (!isText(title)) fail(`${where}: topicTitles["${n}"] must be text`);
        if (!Array.isArray(ref.scopeTopics) || !ref.scopeTopics.map(String).includes(n)) fail(`${where}: topicTitles["${n}"] is not a scope topic`);
      }
    }
    if (!Array.isArray(ref.cards) || !ref.cards.length) return fail(`${where}: cards must be a non-empty array`);
    const ids = new Set();
    ref.cards.forEach((card, i) => {
      const at = `${where} / ${isText(card?.id) ? card.id : `card ${i + 1}`}`;
      if (!card || typeof card !== 'object') return fail(`${at}: not an object`);
      if (!isText(card.id)) fail(`${at}: missing id`);
      else if (ids.has(card.id)) fail(`${at}: duplicate id`);
      else if (!/^[a-z0-9-]+$/.test(card.id)) fail(`${at}: id may only use a–z, 0–9 and "-"`);
      ids.add(card.id);
      if (!Number.isInteger(card.topic) || !named(card.topic)) fail(subject.topics ? `${at}: topic ${card.topic} has no name in ${subject.key}.topics` : `${at}: topic ${card.topic} must be a lecture number`);
      if (!isText(card.title)) fail(`${at}: missing title`);
      if (!Quizy.REFERENCE_KINDS.includes(card.kind)) fail(`${at}: kind must be ${Quizy.REFERENCE_KINDS.join(', ')}`);
      if (!isText(card.summary)) fail(`${at}: missing summary`);
      if (!isText(card.source)) fail(`${at}: missing source`);
      if (card.example !== undefined && !isText(card.example)) fail(`${at}: example must be text`);
      for (const field of ['steps', 'points']) {
        if (card[field] === undefined) continue;
        if (!Array.isArray(card[field]) || !card[field].length || !card[field].every(isText)) fail(`${at}: ${field} must be a non-empty list of texts`);
      }
      if (card.kind === 'algorithm' && card.steps === undefined) fail(`${at}: an algorithm card needs steps`);
      if (card.kind === 'model' && card.model === undefined) fail(`${at}: a model card needs a model`);
      if (card.model !== undefined) checkModel(card.model, at, fail);
      if (!Array.isArray(card.images)) fail(`${at}: images must be a list (empty for none)`);
      else card.images.forEach((image, j) => {
        if (!isText(image?.src) || !isText(image?.alt)) fail(`${at}: images[${j}] needs src and alt`);
        else if (!exists(image.src)) fail(`${at}: images[${j}] ${image.src} not found`);
        if (!(Number.isInteger(image?.width) && image.width > 0 && Number.isInteger(image?.height) && image.height > 0)) fail(`${at}: images[${j}] needs its width and height in pixels`);
      });
    });
  };

  function checkModel(model, at, fail) {
    const rows = (name, list) => {
      if (!Array.isArray(list) || !list.length) return fail(`${at}: model.${name} must be a non-empty list`);
      list.forEach((row, i) => { if (!isText(row?.math) || !isText(row?.meaning)) fail(`${at}: model.${name}[${i}] needs math and meaning`); });
    };
    if (!model || typeof model !== 'object') return fail(`${at}: model must be an object`);
    rows('variables', model.variables);
    if (!isText(model.objective)) fail(`${at}: model.objective must be a formula`);
    rows('constraints', model.constraints);
  }

  // Sheet search: every term (Quizy.searchTerms) must appear in the card's texts, its formulas as plain
  // text, or its topic name. No terms matches every card.
  const cache = new WeakMap();
  Quizy.cardMatches = function (card, terms, subject) {
    if (!terms.length) return true;
    if (!cache.has(card)) {
      const texts = [...Quizy.referenceTexts(card).map(([, text]) => text), ...Quizy.referenceFormulas(card).map(([, tex]) => `$${tex}$`),
        subject?.topics?.[String(card.topic)] || ''];
      cache.set(card, Quizy.fold(texts.map(Quizy.mathToPlain).join('\n')));
    }
    const text = cache.get(card);
    return terms.every(term => text.includes(term));
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
