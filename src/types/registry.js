'use strict';

// Question types. Each file in src/types/ registers one type:
//
//   Quizy.registerType('name', {
//     // Pure and Node-safe (tools/build-data.cjs and tests/ use these):
//     validate(q, set, fail)     type-specific checks; call fail(message) once per problem
//     makeOrder(q, shuffle)      {choiceOrder, pairOrder, optionOrder} for one round item, as arrays of
//                                original indices (grading always uses original indices)
//     score(q, response)         marks earned for a response
//     // Browser only:
//     needsCheckButton           true: the answer is submitted with "Check answer"
//     hints(q, set)              hint nodes shown above the inputs ([] for none)
//     render(container, q, item, onReady, submit)
//                                draw the inputs into container. Check-button types call onReady(true/false)
//                                to enable the button; tap-to-answer types call submit(response) themselves.
//     readResponse(container, q, item)          check-button types: read the response from the DOM
//     showResult(container, q, item, response)  disable the inputs, mark correct / wrong / missed, add tags
//   });
//
// src/ui/quiz.js only ever calls these; it never checks q.type itself.
(function (Quizy) {
  Quizy.types = {};
  Quizy.registerType = (name, impl) => { Quizy.types[name] = impl; };

  // Shared by the types and tools/build-data.cjs.
  const isText = value => typeof value === 'string' && value.length > 0;
  const validIndex = (i, list) => Number.isInteger(i) && i >= 0 && i < list.length;
  const where = (q, set) => `${set.id} / ${q.id}`;

  function checkWords(where, text, words, fail) {
    if (!Array.isArray(words)) return fail(`${where}: emphasis must be an array`);
    for (const word of words) {
      if (!isText(word) || !text.includes(word)) fail(`${where}: emphasis "${word}" does not appear in the text`);
    }
  }

  // Checks for types that use choices[] and answer[] (single, truefalse, multi).
  // Returns false when the rest of the checks can't run.
  function checkChoices(q, set, fail) {
    const at = where(q, set);
    if (!Array.isArray(q.choices) || q.choices.length < 2 || !q.choices.every(isText)) { fail(`${at}: needs at least two text choices`); return false; }
    if (!Array.isArray(q.answer) || !q.answer.length) { fail(`${at}: answer must be a non-empty array of indices`); return false; }
    if (!q.answer.every(i => validIndex(i, q.choices))) fail(`${at}: answer index out of range`);
    if (new Set(q.answer).size !== q.answer.length) fail(`${at}: repeated answer index`);
    return true;
  }

  function checkEmphasisInChoices(q, set, fail) {
    if (q.emphasisInChoices === undefined) return;
    for (const [i, words] of Object.entries(q.emphasisInChoices)) {
      if (!validIndex(Number(i), q.choices)) fail(`${where(q, set)}: emphasisInChoices index ${i} out of range`);
      else checkWords(`${where(q, set)} choice ${i}`, q.choices[Number(i)], words, fail);
    }
  }

  // Option text with any emphasised words, for choice-based types.
  function choiceText(q, original) {
    const text = Quizy.el('span', 'text');
    Quizy.richText(text, q.choices[original], q.emphasisInChoices?.[original]);
    return text;
  }

  // After answering a choice-based question: disable every option and mark it.
  // missed = [className, tag] for an answer that wasn't picked.
  function markChoices(container, q, picked, missed) {
    for (const option of container.children) {
      const original = Number(option.dataset.original);
      const isAnswer = q.answer.includes(original);
      const wasPicked = picked.includes(original);
      if (option.tagName === 'BUTTON') option.disabled = true;
      else option.querySelector('input').disabled = true;
      option.classList.add('done');
      if (isAnswer && wasPicked) { option.classList.add('correct'); addTag(option, '✓ Correct'); }
      else if (isAnswer) { option.classList.add(missed[0]); addTag(option, missed[1]); }
      else if (wasPicked) { option.classList.add('wrong'); addTag(option, '✗ Your pick'); }
    }
  }
  function addTag(node, text) { node.append(Quizy.el('span', 'tag', text)); }

  Quizy.typeHelpers = {isText, validIndex, where, checkWords, checkChoices, checkEmphasisInChoices, choiceText, markChoices};

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
