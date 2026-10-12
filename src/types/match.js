'use strict';

// match: one <select> per prompt; prompts and options are both shuffled. Marks × (correct pairs / pairs).
(function (Quizy) {
  const {isText, where, answerRows, option} = Quizy.typeHelpers;

  // True when the option index picked for a pair gives that pair's answer.
  const isRight = (q, pair, picked) => picked !== null && q.options[picked] === pair.answer;

  Quizy.registerType('match', {
    validate(q, set, fail) {
      const at = where(q, set);
      if (!Array.isArray(q.pairs) || !q.pairs.length) return fail(`${at}: match needs pairs`);
      if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) return fail(`${at}: match needs at least two options`);
      for (const pair of q.pairs) {
        if (!isText(pair.prompt)) fail(`${at}: a pair is missing its prompt`);
        if (!q.options.includes(pair.answer)) fail(`${at}: pair answer "${pair.answer}" is not in options`);
      }
    },
    makeOrder: (q, shuffle) => ({choiceOrder: [], pairOrder: shuffle(Quizy.order(q.pairs.length)), optionOrder: shuffle(Quizy.order(q.options.length))}),
    // response[original pair index] = picked original option index, or null.
    score: (q, response) => Quizy.marksOf(q) * q.pairs.filter((pair, i) => isRight(q, pair, response[i])).length / q.pairs.length,

    needsCheckButton: true,
    hints: () => [Quizy.el('p', 'hint', 'Pick an option for each item, then check your answer.')],
    render(container, q, item, onReady) {
      item.pairOrder.forEach((original, i) => {
        const row = Quizy.el('div', 'match-row');
        row.dataset.original = original;
        const id = `match-${i}`;
        const prompt = Quizy.richEl('label', 'match-prompt', q.pairs[original].prompt);
        prompt.htmlFor = id;
        const select = Quizy.el('select');
        select.id = id;
        select.add(new Option('Choose…', ''));
        for (const o of item.optionOrder) select.add(option(q.options[o], String(o)));
        select.addEventListener('change', () => onReady(![...container.querySelectorAll('select')].some(s => !s.value)));
        row.append(prompt, select);
        container.append(row);
      });
    },
    readResponse(container, q) {
      const response = q.pairs.map(() => null);
      for (const row of container.children) {
        const value = row.querySelector('select').value;
        response[Number(row.dataset.original)] = value === '' ? null : Number(value);
      }
      return response;
    },
    showResult(container, q, item, response) {
      for (const row of container.children) {
        const pair = q.pairs[Number(row.dataset.original)];
        const correct = isRight(q, pair, response[Number(row.dataset.original)]);
        row.querySelector('select').disabled = true;
        row.classList.add(correct ? 'correct' : 'wrong');
        if (!correct) row.append(Quizy.richEl('p', 'match-answer', `Answer: ${pair.answer}`));
      }
    },
    reference: q => 'Correct matches:\n' + q.pairs.map(pair => `- ${pair.prompt} → ${pair.answer}`).join('\n'),
    answerKey: q => [answerRows(q.pairs.map(pair => [pair.prompt, pair.answer]))]
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
