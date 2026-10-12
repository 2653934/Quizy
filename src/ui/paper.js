'use strict';

// Mock papers: "Generate a mock test" and "Replay paper code" on the setup screen, the interlude between
// Section A and Section B, and the paper's summary (section marks, seen vs new, questions to redo).
// The paper itself is built by Quizy.makePaper (src/core/paper.js) and played by ui.startPaper (src/ui/quiz.js).
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, formatMarks, marksOf, isFull, state} = Quizy;

  const percent = (score, marks) => `${Math.round(score / marks * 100)}%`;
  const snippet = text => text.length > 90 ? text.slice(0, 88).trimEnd() + '…' : text;

  // "Not enough theory questions in L5 only: pick more lectures."
  function notEnough(paper) {
    const {section, lectures, available} = paper;
    const kind = section.name.toLowerCase();
    if (!lectures.length) return `Not enough ${kind} questions in ${state.subject.key.toUpperCase()} to fill Section ${section.letter} (${plural(section.marks, 'mark')}) yet.`;
    const where = Quizy.lectureLabel(lectures) + (lectures.length === 1 ? ' only' : '');
    return available < section.marks
      ? `Not enough ${kind} questions in ${where}: pick more lectures.`
      : `The ${kind} questions in ${where} can’t add up to exactly ${plural(section.marks, 'mark')}: pick more lectures.`;
  }

  function startPaper(code) {
    const paper = Quizy.makePaper({sets: state.sets, lectures: ui.chosenLectures(), code});
    if (!paper.ok) { $('setup-message').textContent = notEnough(paper); return; }
    ui.startPaper(paper);
  }

  ui.generatePaper = () => startPaper(Quizy.newPaperCode());

  ui.replayPaper = function () {
    const typed = $('paper-code').value.trim();
    if (!/^\d{1,9}$/.test(typed)) {
      $('setup-message').textContent = 'Type the paper’s code: the number shown as “Paper 4821”.';
      return;
    }
    startPaper(Number(typed));
  };

  // Between the sections: how Section A went, then on to Section B.
  ui.showInterlude = function () {
    const done = state.paper.sections.find(s => s.start + s.count === state.index);
    const next = Quizy.currentSection();
    const items = state.round.slice(done.start, done.start + done.count);
    const score = items.reduce((sum, item) => sum + (item.score || 0), 0);
    $('interlude-code').textContent = `Paper ${state.paper.code}`;
    $('interlude-title').textContent = `Section ${done.letter} done: ${formatMarks(score)} / ${formatMarks(done.marks)}.`;
    $('interlude-detail').textContent = `Section ${next.letter} · ${next.name}: ${plural(next.count, 'question')}, ${plural(next.marks, 'mark')}.`
      + (next.key === 'theory' ? ' Written answers are self-marked: reveal the model answer, then tick the points you covered.' : '');
    $('continue').textContent = `On to ${next.name.toLowerCase()} →`;
    ui.show('interlude');
  };

  // A normal round with exactly these questions (from the paper's summary).
  function retry(questions) {
    const marks = questions.reduce((sum, q) => sum + marksOf(q), 0);
    ui.startRound({id: `${state.subject.key}-retry`, subject: state.subject.key, title: 'Questions to retry', kind: 'retry', totalMarks: marks}, questions);
  }
  let missed = [];
  ui.retryMissed = () => retry(missed);

  ui.showPaperSummary = function () {
    const {paper, round} = state;
    const totals = Quizy.roundTotals(round);
    const sum = (items, f) => items.reduce((total, item) => total + f(item), 0);
    $('progress').value = $('progress').max;
    $('summary-eyebrow').textContent = 'Mock test complete';
    $('summary-title').textContent = `${formatMarks(totals.score)} / ${formatMarks(totals.marks)} marks · ${percent(totals.score, totals.marks)}`;
    $('summary-detail').textContent = `Paper ${paper.code} · ${state.subject.key.toUpperCase()} · ${Quizy.lectureLabel(paper.lectures)}. `
      + 'To sit this paper again, pick the same lectures and replay the code. Your latest answers are saved on this device.';

    const rows = paper.sections.map(s => {
      const items = round.slice(s.start, s.start + s.count);
      return [`Section ${s.letter} · ${s.name}`, `${formatMarks(sum(items, i => i.score || 0))} / ${formatMarks(s.marks)}`];
    });
    rows.push(['Total', `${formatMarks(totals.score)} / ${formatMarks(totals.marks)} (${percent(totals.score, totals.marks)})`]);
    $('paper-scores').replaceChildren(...rows.flatMap(([name, value]) => [el('dt', '', name), el('dd', '', value)]));

    const origin = kind => {
      const items = round.filter(item => Quizy.originOf(item.set) === kind);
      return `${formatMarks(sum(items, i => i.score || 0))} / ${formatMarks(sum(items, i => marksOf(i.q)))} marks`;
    };
    $('paper-origin').textContent = `Seen questions: ${origin('seen')} · New questions: ${origin('new')}`;

    const notFull = round.filter(item => !isFull(item.score || 0, item.q));
    missed = notFull.map(item => item.q);
    $('missed-title').textContent = notFull.length ? `Not fully correct (${notFull.length}): tap one to redo it` : 'Every question fully correct.';
    $('missed-list').replaceChildren(...notFull.map(item => {
      const li = el('li');
      const button = el('button', 'missed-item');
      button.type = 'button';
      button.append(el('span', 'missed-text', snippet(item.q.question)),
        el('span', 'missed-marks', `${formatMarks(item.score || 0)} / ${formatMarks(marksOf(item.q))} · Section ${paper.sections.find(s => s.key === item.section).letter}`));
      button.addEventListener('click', () => retry([item.q]));
      li.append(button);
      return li;
    }));
    $('missed-list').hidden = !notFull.length;
    $('retry-missed').hidden = !notFull.length;
    $('paper-result').hidden = false;
    ui.show('summary');
  };
})(window.Quizy = window.Quizy || {});
