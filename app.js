'use strict';

(async function () {
  const {$, el, richText, shuffle, order, plural, formatMarks, letter, marksOf, isFull} = Quizy;
  const {storage} = Quizy;

  const data = await Quizy.loadData();
  if (!data || !Array.isArray(data.subjects) || !data.subjects.length) {
    $('bank-note').textContent = 'The question bank could not be loaded.';
    $('start').disabled = true;
    return;
  }

  storage.migrate();

  let subject, sets = [], attempts = {};
  let round = [], index = 0, answered = false, roundSet = null, roundScore = 0, roundFull = 0, roundMarks = 0;

  // ---- Theme -------------------------------------------------------------
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
  function applyTheme(theme) {
    const {accent, paper, light, aside} = theme;
    const tokens = {
      '--accent': accent, '--paper': paper, '--light': light, '--aside': aside,
      '--accent-dark': mix(accent, '#000000', 0.85),
      '--seal': mix(accent, '#ffffff', 0.18),
      '--line': mix(accent, paper, 0.2),
      '--track': mix(accent, paper, 0.13),
      '--shadow': mix(accent, paper, 0.25),
      '--field-line': mix(mix(accent, '#213438', 0.5), paper, 0.45),
      '--surface': mix(paper, '#ffffff', 0.25),
      '--choice-bg': mix(paper, '#ffffff', 0.45)
    };
    for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]').content = accent;
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="14" fill="${accent}" stroke="#213438" stroke-width="4"/><text x="32" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="45" font-weight="bold" fill="#ffffff">q</text></svg>`;
    document.querySelector('link[rel="icon"]').href = 'data:image/svg+xml,' + encodeURIComponent(icon);
  }

  // ---- Subjects and setup ------------------------------------------------
  function allQuestions() { return sets.flatMap(s => s.questions); }
  function currentSet() { return sets.find(s => s.id === $('set').value); }

  function updateStats() {
    const questions = allQuestions();
    $('bank-count').textContent = questions.length;
    $('total-count').textContent = questions.length;
    $('correct-count').textContent = questions.filter(q => attempts[q.id]?.correct === true).length;
    $('review-count').textContent = questions.filter(q => attempts[q.id]?.correct === false).length;
  }

  function selection() {
    const set = currentSet();
    if (!set) return [];
    const lecture = $('lecture').value;
    const reviewOnly = $('mode').value === 'review';
    return set.questions.filter(q => (lecture === 'all' || String(q.lecture) === lecture) && (!reviewOnly || attempts[q.id]?.correct === false));
  }

  function updateNote() {
    const set = currentSet();
    if (!set) return;
    const selected = selection();
    const marks = selected.reduce((sum, q) => sum + marksOf(q), 0);
    const lectures = new Set(set.questions.map(q => q.lecture)).size;
    $('bank-note').textContent = set.kind === 'past-paper'
      ? `${plural(selected.length, 'question')} · ${plural(marks, 'mark')} · order randomised`
      : `${plural(selected.length, 'question')} selected from ${plural(set.questions.length, 'question')} across ${plural(lectures, 'lecture')}.`;
    $('setup-message').textContent = '';
  }

  function chooseSet() {
    const set = currentSet();
    $('set-description').textContent = set.description || '';
    const lecture = $('lecture');
    lecture.replaceChildren(new Option('All lectures in this set', 'all'));
    const lectures = [...new Set(set.questions.map(q => q.lecture))].sort((a, b) => a - b);
    for (const n of lectures) lecture.add(new Option(`Lecture ${n}`, String(n)));
    updateNote();
  }

  function chooseSubject(key) {
    subject = data.subjects.find(s => s.key === key) || data.subjects[0];
    storage.setLastSubject(subject.key);
    sets = subject.sets.map(id => data.sets[id]).filter(Boolean);
    attempts = storage.loadAttempts(subject.key);

    applyTheme(subject.theme);
    const short = subject.key.toUpperCase();
    document.title = `Quizy · ${short} study room`;
    $('side-code').textContent = subject.code;
    $('side-name').textContent = subject.name;
    $('topline-label').textContent = `${subject.code} / TEST PRACTICE`;
    $('topline-pill').textContent = `${short} · ${plural(sets.length, 'quiz set')}`;
    $('hero-eyebrow').textContent = `The ${short} study room`;
    for (const tab of $('subjects').children) tab.setAttribute('aria-pressed', String(tab.dataset.key === subject.key));

    $('setup-form').hidden = !sets.length;
    $('empty').hidden = sets.length > 0;
    const setSelect = $('set');
    setSelect.replaceChildren(...sets.map(s => new Option(s.title, s.id)));
    if (sets.length) chooseSet();
    updateStats();
  }

  for (const s of data.subjects) {
    const tab = el('button', 'subject-tab');
    tab.type = 'button';
    tab.dataset.key = s.key;
    tab.title = `${s.code} · ${s.name}`;
    tab.append(el('b', '', s.key.toUpperCase()));
    if (s.code !== s.key.toUpperCase()) tab.append(el('small', '', s.code));
    tab.addEventListener('click', () => { if (s.key !== subject.key) chooseSubject(s.key); });
    $('subjects').append(tab);
  }

  // ---- Quiz --------------------------------------------------------------
  function show(view) {
    for (const id of ['setup', 'quiz', 'summary']) $(id).hidden = id !== view;
    for (const tab of $('subjects').children) tab.disabled = view === 'quiz';
    // styles.css hides the hero and stats and compacts the header while body[data-view=quiz].
    document.body.dataset.view = view;
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function sourceLine(q) {
    const parts = [`Lecture ${q.lecture}`, q.concept];
    if (q.source?.pages?.length) parts.push(`Slide ${q.source.pages[0]}`);
    if (q.number !== undefined) parts.push(`Paper Q${q.number}`);
    if (roundSet.totalMarks !== undefined || marksOf(q) !== 1) parts.push(plural(marksOf(q), 'mark'));
    return parts.filter(Boolean).join(' · ');
  }

  function drawQuestion() {
    answered = false;
    const item = round[index];
    const q = item.q;
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

    const type = Quizy.types[q.type];
    $('hints').replaceChildren(...type.hints(q, roundSet));

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
    if (answered) return;
    const item = round[index];
    const q = item.q;
    const choices = $('choices');
    const type = Quizy.types[q.type];
    const score = type.score(q, response);
    type.showResult(choices, q, item, response);
    answered = true;
    $('check').hidden = true;

    const full = isFull(score, q);
    roundScore += score;
    if (full) roundFull++;
    attempts[q.id] = {correct: full, score, at: new Date().toISOString()};
    storage.saveAttempts(subject.key, attempts);
    updateStats();

    const feedback = $('feedback');
    const marks = marksOf(q);
    feedback.className = 'feedback ' + (full ? 'right' : score > 0 ? 'partial' : 'incorrect');
    const heading = el('div', 'verdict');
    heading.append(el('strong', '', full ? 'Correct!' : score > 0 ? 'Partly right.' : 'Not quite.'));
    if (roundSet.totalMarks !== undefined || marks !== 1 || (score > 0 && !full)) heading.append(el('span', 'score', `${formatMarks(score)} / ${formatMarks(marks)} ${marks === 1 ? 'mark' : 'marks'}`));
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
    $('next').hidden = false;
    $('next').focus({preventScroll: true});
  }

  function endRound() {
    $('progress').value = round.length;
    const hasMarks = roundSet.totalMarks !== undefined;
    $('summary-title').textContent = hasMarks
      ? `${formatMarks(roundScore)} / ${formatMarks(roundMarks)} marks`
      : `${roundFull} out of ${round.length} correct`;
    $('summary-detail').textContent = (hasMarks ? `${roundFull} of ${plural(round.length, 'question')} fully correct. ` : '')
      + 'Your latest answers are saved on this device. Select “Only ones I got wrong” to retry anything you missed.';
    show('summary');
  }

  $('set').addEventListener('change', chooseSet);
  $('lecture').addEventListener('change', updateNote);
  $('mode').addEventListener('change', updateNote);
  $('start').addEventListener('click', () => {
    const selected = selection();
    if (!selected.length) {
      $('setup-message').textContent = $('mode').value === 'review' ? 'No missed questions here yet. Try “All questions” first.' : 'No questions in this selection yet.';
      return;
    }
    roundSet = currentSet();
    round = shuffle(selected).map(q => ({
      q,
      ...Quizy.types[q.type].makeOrder(q, shuffle)
    }));
    index = 0;
    roundScore = 0;
    roundFull = 0;
    roundMarks = selected.reduce((sum, q) => sum + marksOf(q), 0);
    show('quiz');
    drawQuestion();
  });
  $('check').addEventListener('click', () => {
    const item = round[index];
    grade(Quizy.types[item.q.type].readResponse($('choices'), item.q, item));
  });
  $('next').addEventListener('click', () => {
    if (!answered) return;
    index++;
    if (index >= round.length) return endRound();
    drawQuestion();
    $('quiz').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  $('quit').addEventListener('click', () => { show('setup'); updateNote(); });
  $('again').addEventListener('click', () => { show('setup'); updateNote(); });

  chooseSubject(storage.lastSubject());
})();
