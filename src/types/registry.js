'use strict';

// Question types. Each file in src/types/ registers one type:
//
//   Quizy.registerType('name', {
//     // Pure and Node-safe (tools/build-data.cjs and tests/ use these):
//     validate(q, set, fail)     type-specific checks; call fail(message) once per problem
//     makeOrder(q, shuffle)      {choiceOrder, pairOrder, optionOrder} for one round item, as arrays of
//                                original indices (grading always uses original indices; empty if nothing shuffles)
//     score(q, response)         marks earned for a response
//     askClaude(q, response)     optional: {answer, reference} as plain text. When present, a "Copy for Claude"
//                                button copies a marking prompt (src/core/prompt.js) after answering / revealing.
//     // Browser only:
//     needsCheckButton           true: the answer is submitted with "Check answer"
//     checkLabel                 optional text for that button (default "Check answer")
//     wideFigure                 optional: true shows the question's image at full panel width (label)
//     hints(q, set)              hint nodes shown above the inputs ([] for none)
//     render(container, q, item, onReady, submit)
//                                draw the inputs into container. Check-button types call onReady(true/false)
//                                to enable the button; tap-to-answer types call submit(response) themselves.
//     readResponse(container, q, item)          check-button types: read the response from the DOM
//     reveal(container, q, item, response, submit)
//                                optional second step (written): the check button calls this instead of grading.
//                                The type shows more (e.g. a model answer and a rubric) and calls
//                                submit(finalResponse) when the user is done; only then is the answer graded and saved.
//     showResult(container, q, item, response)  disable the inputs, mark correct / wrong / missed, add tags
//     resultNotes(q, response)   optional: nodes added to the feedback after the verdict, before the study note
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

  // For types whose parts / rubric points carry their own marks: they must add up to the question's marks.
  const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
  function checkMarksSum(q, set, list, what, fail) {
    const sum = list.reduce((total, x) => total + (positive(x.marks) ? x.marks : 0), 0);
    if (Math.abs(sum - Quizy.marksOf(q)) > 1e-9) fail(`${where(q, set)}: ${what} marks add up to ${sum}, but the question has ${Quizy.marksOf(q)}`);
  }

  // A labelled block of text that keeps its line breaks (model answer, worked solution, accepted answers).
  function textBlock(className, eyebrow, text) {
    const block = Quizy.el('div', className);
    block.append(Quizy.el('div', 'eyebrow', eyebrow), Quizy.el('p', 'pre', text));
    return block;
  }

  // A one-line text input that phones won't autocorrect or capitalise.
  function textInput(className) {
    const input = Quizy.el('input', className);
    input.type = 'text';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.spellcheck = false;
    return input;
  }

  // Enter in a text input submits, as long as the check button would be enabled.
  function onEnter(input, ready, submit) {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && ready()) { event.preventDefault(); submit(); }
    });
  }

  Quizy.typeHelpers = {isText, validIndex, where, checkWords, checkChoices, checkEmphasisInChoices, choiceText, markChoices,
    positive, checkMarksSum, textBlock, textInput, onEnter};

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
