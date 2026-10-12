'use strict';

// label: name the numbered boxes drawn into a diagram (like Moodle's drag-and-drop onto image).
// One <select> per label in number order; the options are shuffled once per round and every row
// gets the same list. Marks × (correct labels / labels).
(function (Quizy) {
  const {isText, where} = Quizy.typeHelpers;

  // True when the option index picked for a label gives that label's answer.
  const isRight = (q, label, picked) => picked !== null && picked !== undefined && q.options[picked] === label.answer;
  // Original label indices sorted by their number (the rows are never shuffled).
  const byNumber = q => Quizy.order(q.labels.length).sort((a, b) => q.labels[a].number - q.labels[b].number);

  Quizy.registerType('label', {
    validate(q, set, fail) {
      const at = where(q, set);
      if (!q.image) fail(`${at}: label needs an image`);
      if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) return fail(`${at}: label needs at least two text options`);
      if (new Set(q.options).size !== q.options.length) fail(`${at}: label options must not repeat`);
      if (!Array.isArray(q.labels) || !q.labels.length) return fail(`${at}: label needs labels`);
      const numbers = new Set();
      q.labels.forEach((label, i) => {
        if (!Number.isInteger(label.number) || label.number < 1) fail(`${at} label ${i + 1}: number must be a positive whole number`);
        else if (numbers.has(label.number)) fail(`${at} label ${i + 1}: number ${label.number} is used twice`);
        numbers.add(label.number);
        if (!q.options.includes(label.answer)) fail(`${at} label ${i + 1}: answer "${label.answer}" is not in options`);
      });
    },
    makeOrder: (q, shuffle) => ({choiceOrder: [], pairOrder: byNumber(q), optionOrder: shuffle(Quizy.order(q.options.length))}),
    // response[original label index] = picked original option index, or null.
    score: (q, response) => Quizy.marksOf(q) * q.labels.filter((label, i) => isRight(q, label, response[i])).length / q.labels.length,

    needsCheckButton: true,
    wideFigure: true,
    hints: () => [Quizy.el('p', 'hint', 'Choose the label for each numbered box, then check your answer.')],
    render(container, q, item, onReady) {
      for (const original of item.pairOrder) {
        const row = Quizy.el('div', 'label-row');
        row.dataset.original = original;
        const id = `label-${original}`;
        const number = Quizy.el('label', 'label-number', String(q.labels[original].number));
        number.htmlFor = id;
        const select = Quizy.el('select');
        select.id = id;
        select.setAttribute('aria-label', `Label ${q.labels[original].number}`);
        select.add(new Option('Choose…', ''));
        for (const o of item.optionOrder) select.add(new Option(q.options[o], String(o)));
        select.addEventListener('change', () => onReady(![...container.querySelectorAll('select')].some(s => !s.value)));
        row.append(number, select);
        container.append(row);
      }
    },
    readResponse(container, q) {
      const response = q.labels.map(() => null);
      for (const row of container.children) {
        const value = row.querySelector('select').value;
        response[Number(row.dataset.original)] = value === '' ? null : Number(value);
      }
      return response;
    },
    showResult(container, q, item, response) {
      for (const row of container.children) {
        const label = q.labels[Number(row.dataset.original)];
        const correct = isRight(q, label, response[Number(row.dataset.original)]);
        row.querySelector('select').disabled = true;
        row.classList.add(correct ? 'correct' : 'wrong');
        if (!correct) row.append(Quizy.el('p', 'label-answer', `Answer: ${label.answer}`));
      }
    }
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
