'use strict';

// numeric: one or more numbers, each its own part with its own marks and tolerance.
// Optional grid {rows, cols} lays the parts out as a matrix, row by row (e.g. attention matrices).
(function (Quizy) {
  const {isText, where, positive, checkMarksSum, textBlock, textInput, onEnter, answerRows} = Quizy.typeHelpers;

  // A plain number (0.0083, .0083, -1.2, 8.33e-3, decimal comma 0,0083) or a simple fraction (1/120).
  // Returns null for anything else, including empty text, other expressions and division by zero.
  const NUMBER = '[+-]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][+-]?\\d+)?';
  const plain = new RegExp(`^${NUMBER}$`);
  const fraction = new RegExp(`^(${NUMBER})\\s*/\\s*(${NUMBER})$`);
  const toNumber = text => Number(text.replace(',', '.'));
  Quizy.parseNumber = function (text) {
    const s = String(text ?? '').trim().replace(/−/g, '-'); // phones sometimes type a real minus sign
    let value = null;
    if (plain.test(s)) value = toNumber(s);
    else {
      const m = fraction.exec(s);
      if (m) value = toNumber(m[1]) / toNumber(m[2]);
    }
    return value !== null && Number.isFinite(value) ? value : null;
  };

  const allowance = part => part.tolerance !== undefined ? part.tolerance : part.relTolerance * Math.abs(part.answer);
  // |x − answer| ≤ tolerance, with a little slack for floating-point rounding (so the exact edge counts).
  function isRight(part, raw) {
    const x = Quizy.parseNumber(raw);
    if (x === null) return false;
    const tol = allowance(part);
    return Math.abs(x - part.answer) <= tol + tol * 1e-9 + 4 * Number.EPSILON * Math.max(Math.abs(x), Math.abs(part.answer));
  }
  const unit = part => part.unit ? ` ${part.unit}` : '';
  const tolerance = part => part.tolerance !== undefined ? `± ${part.tolerance}` : `± ${+(part.relTolerance * 100).toPrecision(6)}%`;
  const expected = part => `${part.answer}${unit(part)} (${tolerance(part)})`;
  const reference = q => 'Expected values:\n' + q.parts.map(part => `${part.label}: ${expected(part)}, ${Quizy.plural(part.marks, 'mark')}`).join('\n')
    + `\n\nWorked solution:\n${q.solution}`;
  const solution = q => textBlock('study-note solution', 'Worked solution', q.solution);

  Quizy.registerType('numeric', {
    validate(q, set, fail) {
      const at = where(q, set);
      if (!Array.isArray(q.parts) || !q.parts.length) return fail(`${at}: numeric needs parts`);
      q.parts.forEach((part, i) => {
        const p = `${at} part ${i + 1}`;
        if (!isText(part.label)) fail(`${p}: missing label`);
        if (typeof part.answer !== 'number' || !Number.isFinite(part.answer)) fail(`${p}: answer must be a finite number`);
        const tolerances = ['tolerance', 'relTolerance'].filter(k => part[k] !== undefined);
        if (tolerances.length !== 1) fail(`${p}: needs exactly one of tolerance or relTolerance`);
        else if (!positive(part[tolerances[0]])) fail(`${p}: ${tolerances[0]} must be a positive number`);
        else if (tolerances[0] === 'relTolerance' && part.answer === 0) fail(`${p}: relTolerance needs a non-zero answer`);
        if (!positive(part.marks)) fail(`${p}: marks must be a positive number`);
        if (part.unit !== undefined && typeof part.unit !== 'string') fail(`${p}: unit must be text`);
      });
      checkMarksSum(q, set, q.parts, 'part', fail);
      if (q.grid !== undefined) {
        const {rows, cols} = q.grid || {};
        if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) fail(`${at}: grid needs whole-number rows and cols`);
        else if (rows * cols !== q.parts.length) fail(`${at}: grid is ${rows} × ${cols} but there are ${q.parts.length} parts`);
      }
      if (q.inputHint !== undefined && !isText(q.inputHint)) fail(`${at}: inputHint must be text`);
      if (!isText(q.solution)) fail(`${at}: numeric needs a solution`);
    },
    makeOrder: () => ({choiceOrder: [], pairOrder: [], optionOrder: []}),
    // response: the typed text of each part, by part index.
    score: (q, response) => q.parts.reduce((sum, part, i) => sum + (isRight(part, response[i]) ? part.marks : 0), 0),
    askClaude: (q, response) => ({
      answer: q.parts.map((part, i) => `${part.label}: ${response[i].trim() || '(no answer)'}${unit(part)}`).join('\n'),
      reference: reference(q)
    }),
    reference,

    needsCheckButton: true,
    hints(q) {
      const hints = [Quizy.el('p', 'hint', 'Type numbers like 0.25, 1/4 or 2.5e-3, then check your answer.')];
      if (q.inputHint) hints.push(Quizy.richEl('p', 'hint', q.inputHint));
      return hints;
    },
    render(container, q, item, onReady, submit) {
      const wrap = Quizy.el('div', q.grid ? 'numeric-grid' : 'numeric-parts');
      if (q.grid) wrap.style.gridTemplateColumns = `repeat(${q.grid.cols}, minmax(0, 1fr))`;
      const inputs = [];
      const ready = () => inputs.every(input => input.value.trim() !== '');
      const read = () => inputs.map(input => input.value);
      q.parts.forEach((part, i) => {
        const row = Quizy.el('div', 'numeric-part');
        const input = textInput('answer-input numeric-input');
        input.inputMode = 'decimal';
        input.id = `numeric-${i}`;
        if (q.grid) {
          input.title = Quizy.mathToPlain(part.label);
          input.setAttribute('aria-label', Quizy.mathToPlain(part.label));
        } else {
          const label = Quizy.richEl('label', 'numeric-label', part.label);
          label.htmlFor = input.id;
          row.append(label);
        }
        const field = Quizy.el('span', 'numeric-field');
        field.append(input);
        if (part.unit) field.append(Quizy.richEl('span', 'numeric-unit', part.unit));
        const note = Quizy.el('p', 'numeric-note');
        note.hidden = true;
        input.addEventListener('input', () => { note.hidden = true; onReady(ready()); });
        input.addEventListener('change', () => {
          note.textContent = 'Couldn’t read this number.';
          note.hidden = input.value.trim() === '' || Quizy.parseNumber(input.value) !== null;
        });
        onEnter(input, ready, () => submit(read()));
        row.append(field, note);
        wrap.append(row);
        inputs.push(input);
      });
      container.append(wrap);
    },
    readResponse: container => [...container.querySelectorAll('input')].map(input => input.value),
    showResult(container, q, item, response) {
      container.querySelectorAll('.numeric-part').forEach((row, i) => {
        const part = q.parts[i];
        const right = isRight(part, response[i]);
        const input = row.querySelector('input');
        input.readOnly = true;
        input.classList.add(right ? 'correct' : 'wrong');
        row.classList.add(right ? 'correct' : 'wrong');
        const note = row.querySelector('.numeric-note');
        Quizy.richText(note, right ? '✓' : (Quizy.parseNumber(response[i]) === null ? 'Couldn’t read this number. ' : '✗ ') + `Expected ${expected(part)}`);
        note.hidden = false;
      });
    },
    resultNotes: q => [solution(q)],
    answerKey: q => [answerRows(q.parts.map(part => [part.label, `${expected(part)} · ${Quizy.plural(part.marks, 'mark')}`])), solution(q)]
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
