'use strict';

// truefalse: two buttons, True then False, never shuffled. Tapping one reveals the answer. Full marks or 0.
(function (Quizy) {
  const {where, checkChoices, checkEmphasisInChoices, choiceText, markChoices, choiceKey, choiceReference} = Quizy.typeHelpers;

  Quizy.registerType('truefalse', {
    validate(q, set, fail) {
      if (!checkChoices(q, set, fail)) return;
      if (q.answer.length !== 1) fail(`${where(q, set)}: truefalse must have exactly one answer`);
      if (JSON.stringify(q.choices) !== '["True","False"]') fail(`${where(q, set)}: truefalse choices must be exactly ["True","False"]`);
      checkEmphasisInChoices(q, set, fail);
    },
    // True/False always stays in paper order.
    makeOrder: q => ({choiceOrder: Quizy.order(q.choices.length), pairOrder: [], optionOrder: []}),
    // response: [picked original index]
    score: (q, response) => q.answer.includes(response[0]) ? Quizy.marksOf(q) : 0,

    needsCheckButton: false,
    hints: () => [],
    render(container, q, item, onReady, submit) {
      container.classList.add('tf');
      for (const original of item.choiceOrder) {
        const button = Quizy.el('button', 'choice');
        button.type = 'button';
        button.dataset.original = original;
        button.append(choiceText(q, original));
        button.addEventListener('click', () => submit([original]));
        container.append(button);
      }
    },
    showResult(container, q, item, response) { markChoices(container, q, response, ['correct', '✓ Answer']); },
    reference: q => `Correct answer: ${q.choices[q.answer[0]]}`,
    answerKey: q => choiceKey(q, false)
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
