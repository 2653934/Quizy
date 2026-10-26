'use strict';

// The quiz panel: draws the current question, grades it and shows the feedback.
// Everything type-specific is delegated to Quizy.types[q.type] (see src/types/registry.js).
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, richEl, richText, shuffle, plural, formatMarks, marksOf, isFull, state, storage} = Quizy;
  const RAPID_FEEDBACK_MS = 420;
  const RAPID_PHASE_MS = 240;
  const rapidGate = Quizy.createRapidAdvanceGate();
  let rapidTimer = null;
  let rapidRun = 0;

  const typeOf = q => Quizy.types[q.type];

  // Question order and option order are shuffled on every new round. Each item keeps the set its
  // question comes from (a round can mix sets: "Everything in …", a mock paper, a retry round).
  // ui.returnTo is null here; the browse view sets it to 'browse' for "Practise this question".
  ui.cancelRapidAdvance = function () {
    clearTimeout(rapidTimer);
    rapidTimer = null;
    rapidGate.cancel();
    rapidRun++;
    $('question-stage').classList.remove('rapid-exit', 'rapid-enter');
    $('summary').classList.remove('rapid-enter');
  };

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bringQuizIntoView() {
    const top = $('quiz').getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * .4) {
      $('quiz').scrollIntoView({behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start'});
    }
  }

  function focusQuestion() { $('question').focus({preventScroll: true}); }

  function advanceQuestion(rapid = false) {
    if (!Quizy.nextItem()) {
      ui.showSummary();
      if (rapid) {
        $('summary').classList.add('rapid-enter');
        void $('summary').offsetHeight;
        $('summary').classList.remove('rapid-enter');
      }
      $('summary-title').focus({preventScroll: true});
      return false;
    }
    // A mock paper pauses between sections.
    if (Quizy.currentSection()?.start === state.index) {
      ui.showInterlude();
      $('interlude-title').focus({preventScroll: true});
      return false;
    }
    drawQuestion();
    bringQuizIntoView();
    if (!rapid) focusQuestion();
    return true;
  }

  function rapidAdvance() {
    const ticket = rapidGate.begin(state);
    const run = ++rapidRun;
    const active = () => run === rapidRun && ui.view === 'quiz' && rapidGate.isCurrent(ticket, state);
    // Leave the marked answer visible long enough to register before moving the whole area.
    rapidTimer = setTimeout(() => {
      if (!active()) return;
      if (reducedMotion()) {
        if (rapidGate.consume(ticket, state)) advanceQuestion();
        return;
      }
      $('question-stage').classList.add('rapid-exit');
      rapidTimer = setTimeout(() => {
        if (!active() || !rapidGate.consume(ticket, state)) return;
        $('question-stage').classList.remove('rapid-exit');
        const hasQuestion = advanceQuestion(true);
        if (!hasQuestion) return;
        $('question-stage').classList.add('rapid-enter');
        void $('question-stage').offsetHeight;
        $('question-stage').classList.remove('rapid-enter');
        rapidTimer = setTimeout(() => {
          if (run === rapidRun && ui.view === 'quiz') focusQuestion();
          rapidTimer = null;
        }, RAPID_PHASE_MS);
      }, RAPID_PHASE_MS);
    }, RAPID_FEEDBACK_MS);
  }

  ui.startRound = function (set, questions, options = {rapidMode: $('rapid-mode').checked}) {
    ui.cancelRapidAdvance();
    ui.returnTo = null;
    Quizy.beginRound(set, shuffle(questions).map(q => ({q, set: state.setOf.get(q.id) || set, ...typeOf(q).makeOrder(q, shuffle)})), null, options);
    ui.show('quiz');
    drawQuestion();
  };

  // A mock paper from Quizy.makePaper: its sections in order, the options shuffled with the paper's own
  // generator so that replaying the code gives the same paper.
  ui.startPaper = function (paper) {
    ui.cancelRapidAdvance();
    ui.returnTo = null;
    const random = list => shuffle(list, paper.random);
    let start = 0;
    const sections = paper.sections.map(s => ({key: s.key, letter: s.letter, name: s.name, marks: s.marks, start: (start += s.items.length) - s.items.length, count: s.items.length}));
    const items = paper.sections.flatMap(s => s.items.map(({q, set}) => ({q, set, section: s.key, ...typeOf(q).makeOrder(q, random)})));
    const set = {id: `${state.subject.key}-paper`, subject: state.subject.key, title: `Mock test · Paper ${paper.code}`, kind: 'mock-paper',
      totalMarks: paper.sections.reduce((sum, s) => sum + s.marks, 0)};
    Quizy.beginRound(set, items, {code: paper.code, lectures: paper.lectures, sections}, {rapidMode: $('rapid-mode').checked});
    ui.show('quiz');
    drawQuestion();
  };

  // Marks are shown on every question of a mock paper and of sets that have a total.
  const showsMarks = item => state.paper !== null || item.set.totalMarks !== undefined;

  function sourceLine(item) {
    const q = item.q;
    const parts = [`Lecture ${q.lecture}`, q.concept];
    if (q.source?.pages?.length) parts.push(`Slide ${q.source.pages[0]}`);
    if (q.number !== undefined) parts.push(`Paper Q${q.number}`);
    if (showsMarks(item) || marksOf(q) !== 1) parts.push(plural(marksOf(q), 'mark'));
    return parts.filter(Boolean).join(' · ');
  }

  function drawQuestion() {
    const {round, index} = state;
    const item = Quizy.currentItem();
    const q = item.q;
    const type = typeOf(q);
    // In a mock paper, position and progress count within the section.
    const section = Quizy.currentSection();
    const [at, count] = section ? [index - section.start, section.count] : [index, round.length];
    $('paper-bar').hidden = !section;
    if (section) $('paper-bar').textContent = `Paper ${state.paper.code} · Section ${section.letter} · ${section.name} (${plural(section.marks, 'mark')})`;
    $('position').textContent = `Question ${at + 1} of ${count}`;
    $('progress').max = count;
    $('progress').value = at;
    $('source').textContent = sourceLine(item);
    richText($('question'), q.question, q.emphasis);
    $('question').classList.toggle('long', q.question.length > 160);

    $('figure').hidden = !q.image;
    $('figure').classList.toggle('wide', !!type.wideFigure);
    if (q.image) {
      $('figure-img').src = q.image.src;
      $('figure-img').alt = q.image.alt;
      $('figure-link').href = q.image.src;
    }

    $('hints').replaceChildren(...type.hints(q, item.set));

    $('feedback').hidden = true;
    $('feedback').replaceChildren();
    $('next').hidden = true;
    $('next').textContent = index === round.length - 1 ? 'See results ↗' : section && at === count - 1 ? `Finish Section ${section.letter} ↗` : 'Next question ↗';
    $('check').hidden = !type.needsCheckButton;
    $('check').disabled = true;
    $('check').textContent = type.checkLabel || 'Check answer';
    ui.hideAsk();

    const choices = $('choices');
    choices.replaceChildren();
    choices.className = 'choices';
    type.render(choices, q, item, ready => { $('check').disabled = !ready; }, grade);
  }

  function grade(response) {
    if (state.answered) return;
    const item = Quizy.currentItem();
    const q = item.q;
    const type = typeOf(q);
    const score = type.score(q, response);
    type.showResult($('choices'), q, item, response);
    Quizy.recordAnswer(score);
    $('check').hidden = true;
    storage.saveAttempts(state.subject.key, state.attempts);
    ui.updateStats();
    showFeedback(item, score, response);
    ui.showAsk(q, response);
    const rapid = Quizy.shouldRapidAdvance(q, score, state.rapidMode);
    $('next').hidden = rapid;
    if (!rapid) return $('next').focus({preventScroll: true});

    $('feedback').querySelector('.verdict').append(el('span', 'rapid-advance', state.index === state.round.length - 1 ? 'Showing results…' : 'Next question…'));
    if (reducedMotion()) {
      advanceQuestion();
    } else {
      rapidAdvance();
    }
  }

  // Verdict and marks, then any type-specific notes (e.g. a worked solution), the study note,
  // then any doubt about the official answer.
  function showFeedback(item, score, response) {
    const {q, set} = item;
    const feedback = $('feedback');
    const marks = marksOf(q);
    const full = isFull(score, q);
    feedback.className = 'feedback ' + (full ? 'right' : score > 0 ? 'partial' : 'incorrect');
    const heading = el('div', 'verdict');
    heading.append(el('strong', '', full ? 'Correct!' : score > 0 ? 'Partly right.' : 'Not quite.'));
    if (showsMarks(item) || marks !== 1 || (score > 0 && !full)) heading.append(el('span', 'score', `${formatMarks(score)} / ${formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}`));
    feedback.append(heading);
    if (typeOf(q).resultNotes) feedback.append(...typeOf(q).resultNotes(q, response));
    feedback.append(...ui.studyNotes(q, set));
    feedback.hidden = false;
  }

  // The study note and any doubt about the official answer (also used by the browse view).
  ui.studyNotes = function (q, set) {
    const nodes = [];
    if (q.explanation || q.optionsNote) {
      const note = el('div', 'study-note');
      note.append(el('div', 'eyebrow', set.unofficialAnswers ? 'Study note (unofficial answer)' : 'Study note'));
      if (q.explanation) note.append(richEl('p', '', q.explanation));
      if (q.optionsNote) note.append(richEl('p', 'small', q.optionsNote));
      nodes.push(note);
    }
    if (q.keyDispute) {
      const caution = el('div', 'caution');
      caution.append(el('div', 'eyebrow', '⚠ About the official answer'), richEl('p', '', q.keyDispute));
      nodes.push(caution);
    }
    return nodes;
  };

  // "Check answer", for types that need it. Types with a reveal() step (written) show more first
  // and call grade() themselves once the user is done.
  ui.check = function () {
    if (state.answered || $('check').hidden) return;
    const item = Quizy.currentItem();
    const type = typeOf(item.q);
    const response = type.readResponse($('choices'), item.q, item);
    if (!type.reveal) return grade(response);
    $('check').hidden = true;
    type.reveal($('choices'), item.q, item, response, grade);
    ui.showAsk(item.q, response);
  };

  ui.next = function () {
    if (!state.answered) return;
    ui.cancelRapidAdvance();
    advanceQuestion();
  };

  // "On to theory" after the interlude.
  ui.resume = function () {
    ui.show('quiz');
    drawQuestion();
  };
})(window.Quizy = window.Quizy || {});
