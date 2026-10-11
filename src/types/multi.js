'use strict';

// multi: "select all that apply" with checkboxes and a "Check answer" button. Moodle-style marking.
(function (Quizy) {
  const {checkChoices, checkEmphasisInChoices, choiceText, markChoices} = Quizy.typeHelpers;

  Quizy.registerType('multi', {
    validate(q, set, fail) {
      if (!checkChoices(q, set, fail)) return;
      checkEmphasisInChoices(q, set, fail);
    },
    makeOrder: (q, shuffle) => ({choiceOrder: shuffle(Quizy.order(q.choices.length)), pairOrder: [], optionOrder: []}),
    // response: original indices of the ticked options.
    // Moodle-style negative marking: marks × max(0, right/C − wrong/W), with C correct and W wrong options.
    score(q, response) {
      const marks = Quizy.marksOf(q);
      const right = response.filter(i => q.answer.includes(i)).length;
      const wrong = response.length - right;
      const W = q.choices.length - q.answer.length;
      return marks * Math.max(0, right / q.answer.length - (W ? wrong / W : 0));
    },

    needsCheckButton: true,
    hints(q, set) {
      const hints = [Quizy.el('p', 'hint', 'Select all that apply.')];
      if (q.negativeMarking && set.negativeMarkingNote) hints.push(Quizy.el('p', 'hint warn', set.negativeMarkingNote));
      return hints;
    },
    render(container, q, item, onReady) {
      item.choiceOrder.forEach((original, i) => {
        const label = Quizy.el('label', 'choice check');
        label.dataset.original = original;
        const box = Quizy.el('input');
        box.type = 'checkbox';
        box.value = original;
        box.addEventListener('change', () => onReady(!!container.querySelector('input:checked')));
        label.append(box, Quizy.el('span', 'letter', Quizy.letter(i)), choiceText(q, original));
        container.append(label);
      });
    },
    readResponse: container => [...container.querySelectorAll('input:checked')].map(box => Number(box.value)),
    showResult(container, q, item, response) { markChoices(container, q, response, ['missed', 'Missed']); }
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
