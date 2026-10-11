'use strict';

// Marks and round totals. Pure and Node-safe. The per-type scoring rules (e.g. the Moodle
// multi-select formula) live in each type's score() in src/types/.
(function (Quizy) {
  Quizy.marksOf = q => q.marks ?? 1;

  // A question counts as "correct" for progress only at full marks.
  Quizy.isFull = (score, q) => score >= Quizy.marksOf(q) - 1e-9;

  // items: round items in play order, each {q, score} once answered.
  Quizy.roundTotals = function (items) {
    let score = 0, full = 0, marks = 0;
    for (const item of items) {
      if (item.score !== undefined) {
        score += item.score;
        if (Quizy.isFull(item.score, item.q)) full++;
      }
      marks += Quizy.marksOf(item.q);
    }
    return {score, full, marks, count: items.length};
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
