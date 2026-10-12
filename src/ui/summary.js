'use strict';

// The end-of-round screen. Sets with totalMarks show marks; other sets show a count.
// A mock paper shows its own breakdown (src/ui/paper.js).
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, plural, formatMarks, state} = Quizy;

  ui.showSummary = function () {
    // A round started from the browse view goes back there.
    const toBrowse = ui.returnTo === 'browse';
    $('to-browse').hidden = !toBrowse;
    $('again').hidden = toBrowse;
    if (state.paper) return ui.showPaperSummary();
    $('summary-eyebrow').textContent = 'Round complete';
    $('paper-result').hidden = true;
    const totals = Quizy.roundTotals(state.round);
    $('progress').value = totals.count;
    const hasMarks = state.roundSet.totalMarks !== undefined;
    $('summary-title').textContent = hasMarks
      ? `${formatMarks(totals.score)} / ${formatMarks(totals.marks)} marks`
      : `${totals.full} out of ${totals.count} correct`;
    $('summary-detail').textContent = (hasMarks ? `${totals.full} of ${plural(totals.count, 'question')} fully correct. ` : '')
      + 'Your latest answers are saved on this device. Select “Only ones I got wrong” to retry anything you missed.';
    ui.show('summary');
  };
})(window.Quizy = window.Quizy || {});
