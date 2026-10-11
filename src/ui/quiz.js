'use strict';

// The quiz panel: draws the current question, grades it and shows the feedback.
// Everything type-specific is delegated to Quizy.types[q.type] (see src/types/registry.js).
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, richText, shuffle, plural, formatMarks, marksOf, isFull, state, storage} = Quizy;

  const typeOf = q => Quizy.types[q.type];

  // Question order and option order are shuffled on every new round.
  ui.startRound = function (set, questions) {
    Quizy.beginRound(set, shuffle(questions).map(q => ({q, ...typeOf(q).makeOrder(q, shuffle)})));
    ui.show('quiz');
    drawQuestion();
  };

  function sourceLine(q) {
    const parts = [`Lecture ${q.lecture}`, q.concept];
    if (q.source?.pages?.length) parts.push(`Slide ${q.source.pages[0]}`);
    if (q.number !== undefined) parts.push(`Paper Q${q.number}`);
    if (state.roundSet.totalMarks !== undefined || marksOf(q) !== 1) parts.push(plural(marksOf(q), 'mark'));
    return parts.filter(Boolean).join(' · ');
  }

  function drawQuestion() {
    const {round, index} = state;
    const item = Quizy.currentItem();
    const q = item.q;
    const type = typeOf(q);
    $('position').textContent = `Question ${index + 1} of ${round.length}`;
    $('progress').max = round.length;
    $('progress').value = index;
    $('source').textContent = sourceLine(q);
    richText($('question'), q.question, q.emphasis);
    $('question').classList.toggle('long', q.question.length > 160);

    $('figure').hidden = !q.image;
    if (q.image) {
      $('figure-img').src = q.image.src;
      $('figure-img').alt = q.image.alt;
      $('figure-link').href = q.image.src;
    }

    $('hints').replaceChildren(...type.hints(q, state.roundSet));

    $('feedback').hidden = true;
    $('feedback').replaceChildren();
    $('next').hidden = true;
    $('next').textContent = index === round.length - 1 ? 'See results ↗' : 'Next question ↗';
    $('check').hidden = !type.needsCheckButton;
    $('check').disabled = true;

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
    showFeedback(q, score);
    $('next').hidden = false;
    $('next').focus({preventScroll: true});
  }

  // Verdict and marks, then the study note, then any doubt about the official answer.
  function showFeedback(q, score) {
    const feedback = $('feedback');
    const marks = marksOf(q);
    const full = isFull(score, q);
    feedback.className = 'feedback ' + (full ? 'right' : score > 0 ? 'partial' : 'incorrect');
    const heading = el('div', 'verdict');
    heading.append(el('strong', '', full ? 'Correct!' : score > 0 ? 'Partly right.' : 'Not quite.'));
    if (state.roundSet.totalMarks !== undefined || marks !== 1 || (score > 0 && !full)) heading.append(el('span', 'score', `${formatMarks(score)} / ${formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}`));
    feedback.append(heading);
    if (q.explanation || q.optionsNote) {
      const note = el('div', 'study-note');
      note.append(el('div', 'eyebrow', 'Study note'));
      if (q.explanation) note.append(el('p', '', q.explanation));
      if (q.optionsNote) note.append(el('p', 'small', q.optionsNote));
      feedback.append(note);
    }
    if (q.keyDispute) {
      const caution = el('div', 'caution');
      caution.append(el('div', 'eyebrow', '⚠ About the official answer'), el('p', '', q.keyDispute));
      feedback.append(caution);
    }
    feedback.hidden = false;
  }

  // "Check answer", for types that need it.
  ui.check = function () {
    const item = Quizy.currentItem();
    grade(typeOf(item.q).readResponse($('choices'), item.q, item));
  };

  ui.next = function () {
    if (!state.answered) return;
    if (!Quizy.nextItem()) return ui.showSummary();
    drawQuestion();
    $('quiz').scrollIntoView({behavior: 'smooth', block: 'start'});
  };
})(window.Quizy = window.Quizy || {});
