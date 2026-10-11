'use strict';

// short: a one-line text answer, compared with a list of accepted answers. Full marks or 0.
(function (Quizy) {
  const {isText, where, textBlock, textInput, onEnter} = Quizy.typeHelpers;

  // Trim, collapse inner whitespace and (unless caseSensitive) lower-case.
  const normalise = (q, text) => {
    const squashed = String(text).trim().replace(/\s+/g, ' ');
    return q.caseSensitive ? squashed : squashed.toLowerCase();
  };
  const isRight = (q, text) => q.accept.some(answer => normalise(q, answer) === normalise(q, text));
  const accepted = q => q.accept.join('\n');

  Quizy.registerType('short', {
    validate(q, set, fail) {
      const at = where(q, set);
      if (!Array.isArray(q.accept) || !q.accept.length || !q.accept.every(a => isText(a) && a.trim())) fail(`${at}: accept must be a non-empty array of non-empty strings`);
      if (q.caseSensitive !== undefined && typeof q.caseSensitive !== 'boolean') fail(`${at}: caseSensitive must be true or false`);
    },
    makeOrder: () => ({choiceOrder: [], pairOrder: [], optionOrder: []}),
    // response: the typed text.
    score: (q, response) => isRight(q, response) ? Quizy.marksOf(q) : 0,
    askClaude: (q, response) => ({
      answer: response.trim() || '(no answer)',
      reference: `Accepted answer${q.accept.length === 1 ? '' : 's'}${q.caseSensitive ? ' (case-sensitive)' : ''}:\n${accepted(q)}`
    }),

    needsCheckButton: true,
    hints: () => [Quizy.el('p', 'hint', 'Type your answer, then check it.')],
    render(container, q, item, onReady, submit) {
      const input = textInput('answer-input short-input');
      input.setAttribute('aria-label', 'Your answer');
      const ready = () => input.value.trim() !== '';
      input.addEventListener('input', () => onReady(ready()));
      onEnter(input, ready, () => submit(input.value));
      container.append(input);
    },
    readResponse: container => container.querySelector('input').value,
    showResult(container, q, item, response) {
      const input = container.querySelector('input');
      input.readOnly = true;
      input.classList.add(isRight(q, response) ? 'correct' : 'wrong');
      container.append(textBlock('answer-key', q.accept.length === 1 ? 'Accepted answer' : 'Accepted answers', accepted(q)));
    }
  });

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
