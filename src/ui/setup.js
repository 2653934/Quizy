'use strict';

// The setup panel (quiz set, lecture, questions mode, description, count line, empty state)
// and the progress stats, which count questions across the whole current subject.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, plural, marksOf, state} = Quizy;

  ui.currentSet = () => state.sets.find(s => s.id === $('set').value);

  ui.updateStats = function () {
    const questions = Quizy.allQuestions();
    const {attempts} = state;
    $('bank-count').textContent = questions.length;
    $('total-count').textContent = questions.length;
    $('correct-count').textContent = questions.filter(q => attempts[q.id]?.correct === true).length;
    $('review-count').textContent = questions.filter(q => attempts[q.id]?.correct === false).length;
  };

  // The questions the current setup choices select, in set order.
  ui.selection = function () {
    const set = ui.currentSet();
    if (!set) return [];
    const lecture = $('lecture').value;
    const reviewOnly = $('mode').value === 'review';
    return set.questions.filter(q => (lecture === 'all' || String(q.lecture) === lecture) && (!reviewOnly || state.attempts[q.id]?.correct === false));
  };

  ui.updateNote = function () {
    const set = ui.currentSet();
    if (!set) return;
    const selected = ui.selection();
    const marks = selected.reduce((sum, q) => sum + marksOf(q), 0);
    const lectures = new Set(set.questions.map(q => q.lecture)).size;
    $('bank-note').textContent = set.kind === 'past-paper'
      ? `${plural(selected.length, 'question')} · ${plural(marks, 'mark')} · order randomised`
      : `${plural(selected.length, 'question')} selected from ${plural(set.questions.length, 'question')} across ${plural(lectures, 'lecture')}.`;
    $('setup-message').textContent = '';
  };

  ui.chooseSet = function () {
    const set = ui.currentSet();
    $('set-description').textContent = set.description || '';
    const lecture = $('lecture');
    lecture.replaceChildren(new Option('All lectures in this set', 'all'));
    const lectures = [...new Set(set.questions.map(q => q.lecture))].sort((a, b) => a - b);
    for (const n of lectures) lecture.add(new Option(`Lecture ${n}`, String(n)));
    ui.updateNote();
  };

  // Fills the set list for the current subject, or shows "No quizzes yet".
  ui.showSets = function () {
    const {sets} = state;
    $('setup-form').hidden = !sets.length;
    $('empty').hidden = sets.length > 0;
    $('set').replaceChildren(...sets.map(s => new Option(s.title, s.id)));
    if (sets.length) ui.chooseSet();
    ui.updateStats();
  };

  // "Start quiz": explain an empty selection, otherwise start a round.
  ui.start = function () {
    const selected = ui.selection();
    if (!selected.length) {
      $('setup-message').textContent = $('mode').value === 'review' ? 'No missed questions here yet. Try “All questions” first.' : 'No questions in this selection yet.';
      return;
    }
    ui.startRound(ui.currentSet(), selected);
  };

  // Back from a round or the summary.
  ui.backToSetup = function () {
    ui.show('setup');
    ui.updateNote();
  };
})(window.Quizy = window.Quizy || {});
