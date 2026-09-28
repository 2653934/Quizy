'use strict';

(async function () {
  const $ = id => document.getElementById(id);
  let bank = window.QUIZY_DATA;
  if (location.protocol !== 'file:') {
    try {
      const response = await fetch('questions.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('Question bank unavailable');
      bank = await response.json();
    } catch (error) {
      console.warn('Using the bundled question bank.', error);
    }
  }
  if (!bank || !Array.isArray(bank.questions)) {
    $('bank-note').textContent = 'The question bank could not be loaded.';
    $('start').disabled = true;
    return;
  }

  const questions = bank.questions;
  const storageKey = 'quizy-dve-attempts-v1';
  let attempts = {};
  try { attempts = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
  catch { attempts = {}; }
  let round = [], index = 0, correct = 0, answered = false;

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function saveAttempt(id, isCorrect) {
    attempts[id] = {correct: isCorrect, at: new Date().toISOString()};
    try { localStorage.setItem(storageKey, JSON.stringify(attempts)); }
    catch { /* Quiz remains usable if browser storage is unavailable. */ }
    updateStats();
  }
  function updateStats() {
    $('bank-count').textContent = questions.length;
    $('total-count').textContent = questions.length;
    $('correct-count').textContent = questions.filter(q => attempts[q.id]?.correct === true).length;
    $('review-count').textContent = questions.filter(q => attempts[q.id]?.correct === false).length;
  }
  function show(view) {
    for (const id of ['setup', 'quiz', 'summary']) $(id).hidden = id !== view;
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
  function sourceLink(q) {
    const source = $('source');
    source.replaceChildren();
    const label = document.createElement('span');
    label.textContent = `Lecture ${q.lecture} · ${q.concept} · Slide ${q.source.pages[0]}`;
    source.append(label);
  }
  function drawQuestion() {
    answered = false;
    const q = round[index];
    $('position').textContent = `Question ${index + 1} of ${round.length}`;
    $('progress').max = round.length;
    $('progress').value = index;
    $('question').textContent = q.question;
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('next').hidden = true;
    $('next').textContent = index === round.length - 1 ? 'See results ↗' : 'Next question ↗';
    sourceLink(q);
    const choices = $('choices');
    choices.replaceChildren();
    for (const [i, option] of q.shuffledChoices.entries()) {
      const button = document.createElement('button');
      button.className = 'choice';
      button.type = 'button';
      const letter = document.createElement('span');
      letter.textContent = String.fromCharCode(65 + i) + '.';
      button.append(letter, document.createTextNode(option.text));
      button.addEventListener('click', () => answer(option.originalIndex));
      choices.append(button);
    }
  }
  function answer(originalIndex) {
    if (answered) return;
    answered = true;
    const q = round[index];
    const isCorrect = originalIndex === q.answerIndex;
    if (isCorrect) correct++;
    saveAttempt(q.id, isCorrect);
    const buttons = [...$('choices').children];
    for (const [i, button] of buttons.entries()) {
      button.disabled = true;
      const option = q.shuffledChoices[i];
      if (option.originalIndex === q.answerIndex) button.classList.add('correct');
      else if (option.originalIndex === originalIndex) button.classList.add('wrong');
    }
    const feedback = $('feedback');
    feedback.replaceChildren();
    feedback.classList.toggle('incorrect', !isCorrect);
    const heading = document.createElement('strong');
    heading.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    const detail = document.createElement('span');
    detail.textContent = q.explanation;
    feedback.append(heading, detail);
    feedback.hidden = false;
    $('next').hidden = false;
    $('next').focus();
  }
  function endRound() {
    $('progress').value = round.length;
    $('summary-title').textContent = `${correct} out of ${round.length} correct`;
    $('summary-detail').textContent = 'Your latest answers are saved on this device. Select “Only ones I got wrong” to retry anything you missed.';
    show('summary');
  }

  const lectures = [...new Set(questions.map(q => q.lecture))].sort((a, b) => a - b);
  for (const lecture of lectures) {
    const option = new Option(`Lecture ${lecture}`, String(lecture));
    $('lecture').add(option);
  }
  $('bank-note').textContent = `${questions.length} questions from ${lectures.length} lecture${lectures.length === 1 ? '' : 's'} so far. More will be added as we study.`;
  $('start').addEventListener('click', () => {
    const lecture = $('lecture').value;
    const reviewOnly = $('mode').value === 'review';
    const selected = questions.filter(q => (lecture === 'all' || String(q.lecture) === lecture) && (!reviewOnly || attempts[q.id]?.correct === false));
    if (!selected.length) {
      $('setup-message').textContent = reviewOnly ? 'No missed questions here yet. Try “All questions” first.' : 'No questions in this selection yet.';
      return;
    }
    $('setup-message').textContent = '';
    round = shuffle(selected).map(q => ({...q, shuffledChoices: shuffle(q.choices.map((text, originalIndex) => ({text, originalIndex})))}));
    index = 0;
    correct = 0;
    show('quiz');
    drawQuestion();
  });
  $('next').addEventListener('click', () => {
    if (!answered) return;
    index++;
    if (index >= round.length) endRound();
    else drawQuestion();
  });
  $('quit').addEventListener('click', () => show('setup'));
  $('again').addEventListener('click', () => show('setup'));
  updateStats();
})();
