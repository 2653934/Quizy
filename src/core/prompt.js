'use strict';

// The "Copy for Claude" prompt: everything Claude needs to mark an answer, as plain text. Pure and Node-safe.
// answer / reference come from the question type's askClaude(q, response) (see src/types/registry.js).
(function (Quizy) {
  Quizy.claudePrompt = function ({subject, set, q, answer, reference}) {
    const marks = Quizy.marksOf(q);
    const course = [subject.code, subject.name].filter(Boolean).join(' ');
    return [
      `I'm practising for ${course}, using the quiz set "${set.title}". Please mark my answer.`,
      `Question (${Quizy.formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}):\n${q.question}`,
      `My answer:\n${answer}`,
      reference,
      ...(set.unofficialAnswers ? ['(These reference answers were written by an AI, not the lecturer. Tell me if you think they are wrong.)'] : []),
      'Mark my answer against the reference above, out of the marks given. Say what is missing or wrong, and give me one tip to improve.'
    ].join('\n\n');
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
