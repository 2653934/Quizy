'use strict';

// single: one correct option. Tapping an option reveals the answer straight away. Full marks or 0.
(function (Quizy) {
  const {where, checkChoices, checkEmphasisInChoices, choiceText, markChoices, choiceKey, choiceReference} = Quizy.typeHelpers;

  Quizy.registerType('single', {
    validate(q, set, fail) {
      if (!checkChoices(q, set, fail)) return;
      if (q.answer.length !== 1) fail(`${where(q, set)}: single must have exactly one answer`);
      checkEmphasisInChoices(q, set, fail);
    },
    makeOrder: (q, shuffle) => ({choiceOrder: shuffle(Quizy.order(q.choices.length)), pairOrder: [], optionOrder: []}),
    // response: [picked original index]
    score: (q, response) => q.answer.includes(response[0]) ? Quizy.marksOf(q) : 0,

    needsCheckButton: false,
    hints: () => [],
    render(container, q, item, onReady, submit) {
      item.choiceOrder.forEach((original, i) => {
        const button = Quizy.el('button', 'choice');
        button.type = 'button';
        button.dataset.original = original;
        button.append(Quizy.el('span', 'letter', Quizy.letter(i)), choiceText(q, original));
        button.addEventListener('click', () => submit([original]));
        container.append(button);
      });
    },
    showResult(container, q, item, response) { markChoices(container, q, response, ['correct', '✓ Answer']); },
    reference: choiceReference,
    answerKey: q => choiceKey(q)
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
