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
  const WRITTEN_FOCUS = 'written-focus';
  let lectures = []; // the chosen lecture chips, as strings; empty means every lecture

  const subjectName = () => state.subject.key.toUpperCase();
  const byLecture = (a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b));
  const lecturesIn = questions => [...new Set(questions.map(q => String(q.lecture)))].sort(byLecture);
  const inLectures = q => !lectures.length || lectures.includes(String(q.lecture));

  // Shared with the browse view (src/ui/browse.js).
  Object.assign(ui, {STYLES, ALL, lecturesIn});

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
    const wrong = Quizy.wrongQuestionIds(questions, attempts).length;
    $('review-count').textContent = wrong;
    $('reset-wrong').hidden = wrong === 0;
  };

  // "Reset wrong answers" (under "Needs another look"): confirm first, then remove only the wrong
  // attempts of the current subject (Quizy.resetWrong) and redraw the stats and the count line.
  ui.confirmResetWrong = function () {
    const wrong = Quizy.wrongQuestionIds(Quizy.allQuestions(), state.attempts).length;
    if (!wrong) return;
    $('reset-detail').textContent = `This clears your saved result for the ${plural(wrong, `${subjectName()} question`)} you got wrong or only partly right, `
      + 'so they count as unanswered again and leave “Only ones I got wrong”.';
    $('reset-dialog').returnValue = '';
    $('reset-dialog').showModal();
  };

  ui.closeResetDialog = function () {
    if ($('reset-dialog').returnValue !== 'reset') return;
    const removed = Quizy.resetWrong();
    storage.saveAttempts(state.subject.key, state.attempts);
    ui.updateStats();
    ui.updateNote();
    // Cleared first, so the same message is announced again after another reset.
    $('reset-status').textContent = '';
    setTimeout(() => { $('reset-status').textContent = `Reset ${plural(removed.length, 'wrong answer')}.`; }, 50);
    // The reset button is hidden now, so keep focus on its card.
    $('review-stat').focus();
  };

  // The questions the current setup choices select, in set order.
  ui.selection = function () {
    const style = $('style').value;
    const reviewOnly = $('mode').value === 'review';
    const unansweredOnly = $('mode').value === 'unanswered';
    return ui.currentSets().flatMap(s => s.questions)
      .filter(q => inLectures(q) && (style === ALL || (style === WRITTEN_FOCUS
        ? ['written', 'numeric'].includes(q.type) : q.type === style))
        && (!reviewOnly || state.attempts[q.id]?.correct === false)
        && (!unansweredOnly || !state.attempts[q.id]));
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
    const before = $('style').value;
    const questions = ui.currentSets().flatMap(s => s.questions).filter(inLectures);
    ui.fillStyles($('style'), questions);
    if (state.subject.key === 'nlp' && questions.some(q => ['written', 'numeric'].includes(q.type))) {
      $('style').add(new Option('Written + calculation', WRITTEN_FOCUS));
      if (before === WRITTEN_FOCUS) $('style').value = WRITTEN_FOCUS;
    }
  }
  ui.fillStyles = function (select, questions, before = select.value) {
    const present = new Set(questions.map(q => q.type));
    select.replaceChildren(new Option('All styles', ALL), ...STYLES.filter(([type]) => present.has(type)).map(([type, name]) => new Option(name, type)));
    select.value = present.has(before) ? before : ALL;
  };

  // Lecture chips: "All", then every lecture in the subject (the mock paper draws from every set).
  // Lectures with nothing in the chosen set(s) are shown muted.
  function buildChips() {
    ui.fillChips($('lectures'), lectures, ui.currentSets().flatMap(s => s.questions), toggleLecture);
  }
  ui.fillChips = function (container, chosen, inSet, onToggle) {
    const inSets = new Set(lecturesIn(inSet));
    const chip = (value, text, pressed) => {
      const button = el('button', 'chip', text);
      button.type = 'button';
      button.dataset.lecture = value;
      button.setAttribute('aria-pressed', String(pressed));
      if (value !== ALL && !inSets.has(value)) {
        button.classList.add('none');
        button.title = 'No questions from this lecture in this quiz set';
      }
      button.addEventListener('click', () => onToggle(value));
      return button;
    };
    container.replaceChildren(chip(ALL, 'All', !chosen.length), ...lecturesIn(Quizy.allQuestions()).map(n => chip(n, Quizy.lectureName(n, state.subject), chosen.includes(n))));
  };

  // "All" clears the choice; a lecture chip toggles. Removing the last lecture goes back to all.
  ui.toggled = (chosen, value) => value === ALL ? [] : chosen.includes(value) ? chosen.filter(n => n !== value) : [...chosen, value].sort(byLecture);
  function toggleLecture(value) {
    lectures = ui.toggled(lectures, value);
    storage.saveLectures(state.subject.key, lectures);
    buildChips();
    buildStyles();
    ui.updateNote();
  }

  ui.chooseSet = function () {
    const set = ui.currentSet();
    const sets = ui.currentSets();
    Quizy.richText($('set-description'), set ? set.description || '' : `Every question from the ${sets.length} sets in ${subjectName()}, mixed together.`);
    $('set-unofficial').hidden = !sets.some(s => s.unofficialAnswers);
    $('set-unofficial').textContent = set ? 'Answers on this set are unofficial' : 'Answers on some of these sets are unofficial';
    buildChips();
    buildStyles();
    ui.updateNote();
  };

  // One action selects every written and calculation question in the exam's five written-focus lectures,
  // including the lecturer's tutorial questions and the new practice bank. Question IDs stay unchanged.
  ui.chooseWrittenFocus = function () {
    if (state.subject.key !== 'nlp') return;
    $('set').value = ALL;
    lectures = ['5', '6', '7', '8', '9'];
    storage.saveLectures(state.subject.key, lectures);
    $('mode').value = 'unanswered';
    ui.chooseSet();
    $('style').value = WRITTEN_FOCUS;
    ui.updateNote();
    $('setup-message').textContent = 'Ready: unanswered written answers and calculations from Lectures 5–9, across every set. Choose All questions to include previous attempts.';
  };

  // Group the smaller NLP set list by purpose. Other subjects keep their existing set order.
  ui.setChoices = function (allLabel) {
    const all = state.sets.length > 1 ? [new Option(allLabel, ALL)] : [];
    if (state.subject.key !== 'nlp') return [...all, ...state.sets.map(s => new Option(s.title, s.id))];
    const group = (label, ids) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      ids.map(id => state.sets.find(s => s.id === id)).filter(Boolean)
        .forEach(s => optgroup.append(new Option(s.title, s.id)));
      return optgroup;
    };
    return [...all,
      group('Practice', ['nlp-practice-bank', 'nlp-test-style-2026', 'nlp-mock-exam']),
      group('Lecturer questions', ['nlp-past-quiz-1-2025', 'nlp-past-quiz-2-2025', 'nlp-practice-quiz', 'nlp-tutorial'])];
  };

  // Fills the set list for the current subject, or shows "No quizzes yet".
  ui.showSets = function () {
    const {sets} = state;
    $('setup-form').hidden = !sets.length;
    $('empty').hidden = sets.length > 0;
    $('set').replaceChildren(...ui.setChoices(`Everything in ${subjectName()}`));
    if (sets.length) $('set').value = sets[0].id;
    $('written-focus').hidden = state.subject.key !== 'nlp';
    const known = new Set(lecturesIn(Quizy.allQuestions()));
    lectures = storage.loadLectures(state.subject.key).filter(n => known.has(n));
    $('paper-code').value = '';
    showPaperChoices();
    // DO names its lectures as topics ("Network flow"), so its chips are labelled "Topic".
    $('lectures-label').textContent = $('browse-lectures-label').textContent = state.subject.topics ? 'Topic' : 'Lecture';
    if (sets.length) ui.chooseSet();
    ui.updateStats();
  };

  // Subjects with an examBlueprint (DO) get "Generate a scope exam" and "Full scope sweep" instead of the
  // 30 + 20 mock test, which doesn't fit their exam (src/core/exam.js, src/ui/paper.js).
  function showPaperChoices() {
    const blueprint = state.subject.examBlueprint;
    $('generate').hidden = !!blueprint;
    $('scope-start').hidden = !blueprint;
    $('paper-note').hidden = !!blueprint;
    $('scope-note').hidden = !blueprint;
    $('paper-code-label').textContent = blueprint ? 'Replay exam code' : 'Replay paper code';
    $('paper-code').placeholder = blueprint ? 'e.g. 4821 or S4821' : 'e.g. 4821';
    $('paper-code').inputMode = blueprint ? 'text' : 'numeric';
    if (!blueprint) {
      // The section marks come from the subject (paperSections), e.g. NLP's 50 + 50.
      const [a, b] = Quizy.paperSectionsOf(state.subject);
      $('paper-note').textContent = `A mock test is shaped like the real one: Section ${a.letter} ${a.name.toLowerCase()} (${a.marks} marks), then Section ${b.letter} ${b.name.toLowerCase()} (${b.marks} marks), from the lectures you picked. Quiz set and question style don’t apply.`;
      return;
    }
    const parts = blueprint.questions.map(x => `${x.label} (${plural(x.marks, 'mark')})`).join(', ');
    const [low, high] = blueprint.seenShare.map(f => Math.round(f * 100));
    $('scope-note').textContent = `A scope exam is shaped like the real ${subjectName()} exam: ${parts}, ${blueprint.totalMarks} marks, from every topic in the final scope `
      + `(“Out of scope” never appears). ${low}–${high}% of the marks are the lecturer’s past questions, favouring the ones asked most often; the rest are new practice questions. `
      + 'A full scope sweep asks one question from every topic. Quiz set, topic chips and question style don’t apply, and the 30 + 20 mock test isn’t used for this subject.';
  }

  // "Start quiz": explain an empty selection, otherwise start a round.
  ui.start = function () {
    const selected = ui.selection();
    if (!selected.length) {
      $('setup-message').textContent = $('mode').value === 'review' ? 'No missed questions here yet. Try “All questions” first.'
        : $('mode').value === 'unanswered' ? 'You have attempted every question in this selection. Choose “Only ones I got wrong” or “All questions” to practise again.'
          : 'No questions in this selection yet.';
      return;
    }
    ui.startRound(ui.roundSet(selected), selected, {rapidMode: $('rapid-mode').checked});
  };

  // Back from a round or the summary.
  ui.backToSetup = function () {
    ui.cancelRapidAdvance?.();
    ui.returnTo = null;
    ui.show('setup');
    ui.updateNote();
  };

  // "End round": back to where the round was started (setup, or the browse list for "Practise this question").
  ui.endRound = function () {
    ui.cancelRapidAdvance?.();
    return ui.returnTo === 'browse' ? ui.backToBrowse() : ui.backToSetup();
  };
})(window.Quizy = window.Quizy || {});
