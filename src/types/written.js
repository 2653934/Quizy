'use strict';

// written: explain / describe / define, self-marked against a rubric. Two steps: "Reveal model answer"
// shows the model answer and the rubric as a checklist; "Submit my mark" grades (sum of ticked marks).
// What the user types is kept per question in storage (quizy-written-v1-<subject>) and restored later.
(function (Quizy) {
  const {isText, validIndex, where, positive, checkMarksSum, textBlock} = Quizy.typeHelpers;

  const subjectKey = () => Quizy.state?.subject?.key;
  const loadText = q => (Quizy.storage && subjectKey() ? Quizy.storage.loadWritten(subjectKey())[q.id] : '') || '';
  function saveText(q, text) {
    if (!Quizy.storage || !subjectKey()) return;
    const texts = Quizy.storage.loadWritten(subjectKey());
    if (text.trim()) texts[q.id] = text; else delete texts[q.id];
    Quizy.storage.saveWritten(subjectKey(), texts);
  }
  const markLabel = marks => `${Quizy.formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}`;
  const reference = q => `Model answer:\n${q.modelAnswer}\n\nRubric:\n` + q.rubric.map(p => `- [${markLabel(p.marks)}] ${p.point}`).join('\n');
  const modelAnswer = q => textBlock('written-model', 'Model answer', q.modelAnswer);

  Quizy.registerType('written', {
    validate(q, set, fail) {
      const at = where(q, set);
      if (!isText(q.modelAnswer)) fail(`${at}: written needs a modelAnswer`);
      if (!Array.isArray(q.rubric) || !q.rubric.length) return fail(`${at}: written needs a rubric`);
      q.rubric.forEach((point, i) => {
        if (!isText(point.point)) fail(`${at} rubric ${i + 1}: missing point text`);
        if (!positive(point.marks)) fail(`${at} rubric ${i + 1}: marks must be a positive number`);
      });
      checkMarksSum(q, set, q.rubric, 'rubric', fail);
    },
    makeOrder: () => ({choiceOrder: [], pairOrder: [], optionOrder: []}),
    // response: {text, ticked}: what was typed and the indices of the rubric points the user ticked.
    score: (q, response) => [...new Set(response.ticked)].filter(i => validIndex(i, q.rubric)).reduce((sum, i) => sum + q.rubric[i].marks, 0),
    askClaude: (q, response) => ({
      answer: response.text.trim() || '(I didn’t write anything down; I only thought it through.)',
      reference: reference(q)
    }),
    reference,

    needsCheckButton: true,
    checkLabel: 'Reveal model answer',
    hints: () => [Quizy.el('p', 'hint', 'Write your answer (or just think it through), then reveal the model answer and mark yourself.')],
    render(container, q, item, onReady) {
      const box = Quizy.el('textarea', 'answer-input written-input');
      box.rows = 5;
      box.placeholder = 'Your answer (optional)';
      box.setAttribute('aria-label', 'Your answer');
      box.value = loadText(q);
      box.addEventListener('input', () => saveText(q, box.value));
      container.append(box);
      onReady(true);
    },
    readResponse: container => ({text: container.querySelector('textarea').value, ticked: []}),
    reveal(container, q, item, response, submit) {
      const box = container.querySelector('textarea');
      saveText(q, box.value);
      box.readOnly = true;
      if (!box.value.trim()) box.placeholder = 'You didn’t write anything.';
      const yours = Quizy.el('div', 'written-yours');
      yours.append(Quizy.el('div', 'eyebrow', 'Your answer'), box);
      const compare = Quizy.el('div', 'written-compare');
      compare.append(yours, modelAnswer(q));

      const rubric = Quizy.el('fieldset', 'rubric');
      rubric.append(Quizy.el('legend', 'eyebrow', 'Tick the points you covered'));
      q.rubric.forEach((point, i) => {
        const label = Quizy.el('label', 'rubric-point');
        const tick = Quizy.el('input');
        tick.type = 'checkbox';
        tick.value = i;
        label.append(tick, Quizy.richEl('span', 'text', point.point), Quizy.el('span', 'rubric-marks', markLabel(point.marks)));
        rubric.append(label);
      });
      const done = Quizy.el('button', 'primary rubric-submit', 'Submit my mark');
      done.type = 'button';
      done.addEventListener('click', () => submit({
        text: box.value,
        ticked: [...rubric.querySelectorAll('input:checked')].map(tick => Number(tick.value))
      }));
      container.replaceChildren(compare, rubric, done);
    },
    showResult(container, q, item, response) {
      for (const tick of container.querySelectorAll('.rubric input')) {
        tick.disabled = true;
        tick.closest('label').classList.add(response.ticked.includes(Number(tick.value)) ? 'ticked' : 'unticked');
      }
      container.querySelector('.rubric-submit')?.remove();
    },
    // The model answer, then the rubric with each point's marks.
    answerKey(q) {
      const rubric = Quizy.el('div', 'rubric answer-rubric');
      rubric.append(Quizy.el('div', 'eyebrow', 'Rubric'));
      for (const point of q.rubric) {
        const row = Quizy.el('div', 'rubric-point');
        row.append(Quizy.richEl('span', 'text', point.point), Quizy.el('span', 'rubric-marks', markLabel(point.marks)));
        rubric.append(row);
      }
      return [modelAnswer(q), rubric];
    }
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
