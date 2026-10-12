'use strict';

// The setup panel (quiz set, lecture chips, question style, questions mode, description, count line,
// empty state) and the progress stats, which count questions across the whole current subject.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, marksOf, state, storage} = Quizy;
  // Kinds counted like a paper ("N questions · M marks · order randomised") rather than as a bank.
  const PAPER_KINDS = ['past-paper', 'practice-quiz', 'tutorial'];
  // "Question style" options, in this order; only the styles in the current selection are listed.
  const STYLES = [
    ['single', 'Multiple choice'], ['truefalse', 'True / False'], ['multi', 'Select all that apply'], ['match', 'Matching'],
    ['short', 'Short answer'], ['numeric', 'Calculation'], ['written', 'Written / theory'], ['label', 'Label the diagram']
  ];
  const ALL = 'all';
  let lectures = []; // the chosen lecture chips, as strings; empty means every lecture

  const subjectName = () => state.subject.key.toUpperCase();
  const byLecture = (a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b));
  const lecturesIn = questions => [...new Set(questions.map(q => String(q.lecture)))].sort(byLecture);
  const inLectures = q => !lectures.length || lectures.includes(String(q.lecture));

  ui.currentSet = () => state.sets.find(s => s.id === $('set').value);
  // The sets the "Quiz set" choice covers: one, or every set of the subject ("Everything in NLP").
  ui.currentSets = () => $('set').value === ALL ? state.sets : state.sets.filter(s => s.id === $('set').value);
  ui.chosenLectures = () => [...lectures];

  // The set a round is played as: the chosen set, or a stand-in for "Everything in …".
  ui.roundSet = function (questions) {
    const set = ui.currentSet();
    if (set) return set;
    const sets = ui.currentSets();
    return {
      id: `${state.subject.key}-all`, subject: state.subject.key, title: `Everything in ${subjectName()}`, kind: 'mixed',
      totalMarks: sets.some(s => s.totalMarks !== undefined) ? questions.reduce((sum, q) => sum + marksOf(q), 0) : undefined
    };
  };

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
    const style = $('style').value;
    const reviewOnly = $('mode').value === 'review';
    return ui.currentSets().flatMap(s => s.questions)
      .filter(q => inLectures(q) && (style === ALL || q.type === style) && (!reviewOnly || state.attempts[q.id]?.correct === false));
  };

  ui.updateNote = function () {
    const sets = ui.currentSets();
    if (!sets.length) return;
    const selected = ui.selection();
    const marks = selected.reduce((sum, q) => sum + marksOf(q), 0);
    const pool = sets.flatMap(s => s.questions);
    $('bank-note').textContent = sets.every(s => PAPER_KINDS.includes(s.kind))
      ? `${plural(selected.length, 'question')} · ${plural(marks, 'mark')} · order randomised`
      : `${plural(selected.length, 'question')} selected from ${plural(pool.length, 'question')} across ${plural(lecturesIn(pool).length, 'lecture')}.`;
    $('setup-message').textContent = '';
  };

  // "Question style": the styles present in the chosen set(s) and lectures. Keeps the choice if it is still there.
  function buildStyles() {
    const present = new Set(ui.currentSets().flatMap(s => s.questions).filter(inLectures).map(q => q.type));
    const select = $('style');
    const before = select.value;
    select.replaceChildren(new Option('All styles', ALL), ...STYLES.filter(([type]) => present.has(type)).map(([type, name]) => new Option(name, type)));
    select.value = present.has(before) ? before : ALL;
  }

  // Lecture chips: "All", then every lecture in the subject (the mock paper draws from every set).
  // Lectures with nothing in the chosen set(s) are shown muted.
  function buildChips() {
    const inSets = new Set(lecturesIn(ui.currentSets().flatMap(s => s.questions)));
    const chip = (value, text, pressed) => {
      const button = el('button', 'chip', text);
      button.type = 'button';
      button.dataset.lecture = value;
      button.setAttribute('aria-pressed', String(pressed));
      if (value !== ALL && !inSets.has(value)) {
        button.classList.add('none');
        button.title = 'No questions from this lecture in this quiz set';
      }
      button.addEventListener('click', () => toggleLecture(value));
      return button;
    };
    $('lectures').replaceChildren(chip(ALL, 'All', !lectures.length), ...lecturesIn(Quizy.allQuestions()).map(n => chip(n, `L${n}`, lectures.includes(n))));
  }

  // "All" clears the choice; a lecture chip toggles. Removing the last lecture goes back to all.
  function toggleLecture(value) {
    if (value === ALL) lectures = [];
    else lectures = lectures.includes(value) ? lectures.filter(n => n !== value) : [...lectures, value].sort(byLecture);
    storage.saveLectures(state.subject.key, lectures);
    buildChips();
    buildStyles();
    ui.updateNote();
  }

  ui.chooseSet = function () {
    const set = ui.currentSet();
    const sets = ui.currentSets();
    $('set-description').textContent = set ? set.description || '' : `Every question from the ${sets.length} sets in ${subjectName()}, mixed together.`;
    $('set-unofficial').hidden = !sets.some(s => s.unofficialAnswers);
    $('set-unofficial').textContent = set ? 'Answers on this set are unofficial' : 'Answers on some of these sets are unofficial';
    buildChips();
    buildStyles();
    ui.updateNote();
  };

  // Fills the set list for the current subject, or shows "No quizzes yet".
  ui.showSets = function () {
    const {sets} = state;
    $('setup-form').hidden = !sets.length;
    $('empty').hidden = sets.length > 0;
    $('set').replaceChildren(...sets.map(s => new Option(s.title, s.id)));
    if (sets.length > 1) $('set').prepend(new Option(`Everything in ${subjectName()}`, ALL));
    if (sets.length) $('set').value = sets[0].id;
    const known = new Set(lecturesIn(Quizy.allQuestions()));
    lectures = storage.loadLectures(state.subject.key).filter(n => known.has(n));
    $('paper-code').value = '';
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
    ui.startRound(ui.roundSet(selected), selected);
  };

  // Back from a round or the summary.
  ui.backToSetup = function () {
    ui.show('setup');
    ui.updateNote();
  };
})(window.Quizy = window.Quizy || {});
