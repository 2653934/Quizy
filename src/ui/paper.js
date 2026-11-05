'use strict';

// Mock papers: "Generate a mock test" and "Replay paper code" on the setup screen, the interlude between
// Section A and Section B, and the paper's summary (section marks, seen vs new, questions to redo).
// The paper itself is built by Quizy.makePaper (src/core/paper.js) and played by ui.startPaper (src/ui/quiz.js).
// Subjects with an examBlueprint (DO) get scope exams and sweeps instead (Quizy.makeScopeExam / makeScopeSweep,
// src/core/exam.js): the same player, with exam questions in place of sections and a per-topic summary.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, formatMarks, marksOf, isFull, state} = Quizy;

  const percent = (score, marks) => `${Math.round(score / marks * 100)}%`;
  // A short plain-text line (maths as plain text, so a cut never lands inside a formula).
  const snippet = text => (text = Quizy.mathToPlain(text)).length > 90 ? text.slice(0, 88).trimEnd() + '…' : text;

  // "Not enough theory questions in L5 only: pick more lectures."
  function notEnough(paper) {
    const {section, lectures, available} = paper;
    const kind = section.name.toLowerCase();
    if (!lectures.length) return `Not enough ${kind} questions in ${state.subject.key.toUpperCase()} to fill Section ${section.letter} (${plural(section.marks, 'mark')}) yet.`;
    const where = Quizy.lectureLabel(lectures, state.subject) + (lectures.length === 1 ? ' only' : '');
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

  // A scope exam or sweep, as the player's paper: each exam question is a section (key q1, q2 …).
  function startScope(kind, code) {
    const make = kind === 'sweep' ? Quizy.makeScopeSweep : Quizy.makeScopeExam;
    const paper = make({subject: state.subject, sets: state.sets, code});
    if (!paper.ok) { $('setup-message').textContent = `Not enough questions in ${state.subject.key.toUpperCase()} to fill this exam yet.`; return; }
    ui.startPaper({
      kind: paper.kind, code: paper.code, label: paper.label, lectures: [], random: paper.random,
      title: paper.kind === 'sweep' ? `${state.subject.key.toUpperCase()} scope sweep` : paper.title,
      sections: paper.questions.map((x, i) => ({key: `q${i + 1}`, letter: String(i + 1), name: x.label, marks: x.total, target: x.marks, short: x.short, items: x.items}))
    });
  }

  ui.generateScope = kind => startScope(kind, Quizy.newPaperCode());

  // "4821" replays a mock paper; for a scope subject "4821" replays an exam and "S4821" a sweep.
  ui.replayPaper = function () {
    const typed = $('paper-code').value.trim();
    const scope = !!state.subject.examBlueprint;
    const match = (scope ? /^(s?)(\d{1,9})$/i : /^()(\d{1,9})$/).exec(typed);
    if (!match) {
      $('setup-message').textContent = scope
        ? 'Type the exam’s code: the number shown as “DO scope exam 4821”, or S and the number for a sweep (“S4821”).'
        : 'Type the paper’s code: the number shown as “Paper 4821”.';
      return;
    }
    if (scope) startScope(match[1] ? 'sweep' : 'exam', Number(match[2]));
    else startPaper(Number(match[2]));
  };

  const isScope = paper => paper.kind === 'exam' || paper.kind === 'sweep';

  // Between the sections: how Section A went, then on to Section B (or Question 1, then Question 2 …).
  ui.showInterlude = function () {
    const done = state.paper.sections.find(s => s.start + s.count === state.index);
    const next = Quizy.currentSection();
    const items = state.round.slice(done.start, done.start + done.count);
    const score = items.reduce((sum, item) => sum + (item.score || 0), 0);
    if (isScope(state.paper)) {
      $('interlude-code').textContent = `${state.paper.title} ${state.paper.label}`;
      $('interlude-title').textContent = `${done.name} done: ${formatMarks(score)} / ${formatMarks(done.marks)}.`;
      $('interlude-detail').textContent = `${next.name}: ${plural(next.count, 'part')}, ${plural(next.marks, 'mark')}. `
        + 'Written answers are self-marked: reveal the model answer, then tick the points you covered.';
      $('continue').textContent = `On to ${next.name} →`;
      ui.show('interlude');
      return;
    }
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
    ui.startRound({id: `${state.subject.key}-retry`, subject: state.subject.key, title: 'Questions to retry', kind: 'retry', totalMarks: marks}, questions,
      {rapidMode: state.rapidMode});
  }
  let missed = [];
  ui.retryMissed = () => retry(missed);

  const rowsOf = rows => rows.flatMap(([name, value]) => [el('dt', '', name), el('dd', '', value)]);

  ui.showPaperSummary = function () {
    const {paper, round} = state;
    const scope = isScope(paper);
    const totals = Quizy.roundTotals(round);
    const sum = (items, f) => items.reduce((total, item) => total + f(item), 0);
    const marksLine = (items, marks) => `${formatMarks(sum(items, i => i.score || 0))} / ${formatMarks(marks)}`;
    $('progress').value = $('progress').max;
    $('summary-eyebrow').textContent = scope ? `${paper.kind === 'sweep' ? 'Scope sweep' : 'Scope exam'} complete` : 'Mock test complete';
    $('summary-title').textContent = `${formatMarks(totals.score)} / ${formatMarks(totals.marks)} marks · ${percent(totals.score, totals.marks)}`;
    $('summary-detail').textContent = scope
      ? `${paper.title} ${paper.label}. To sit it again, replay the code ${paper.label}. Your latest answers are saved on this device.`
        + (paper.sections.some(s => s.short) ? ' Some exam questions could not be filled exactly: see the marks below.' : '')
      : `Paper ${paper.code} · ${state.subject.key.toUpperCase()} · ${Quizy.lectureLabel(paper.lectures, state.subject)}. `
        + 'To sit this paper again, pick the same lectures and replay the code. Your latest answers are saved on this device.';

    const rows = paper.sections.map(s => {
      const items = round.slice(s.start, s.start + s.count);
      const name = scope ? s.name + (s.short ? ` (filled ${formatMarks(s.marks)} of ${formatMarks(s.target)})` : '') : `Section ${s.letter} · ${s.name}`;
      return [name, marksLine(items, s.marks)];
    });
    rows.push(['Total', `${formatMarks(totals.score)} / ${formatMarks(totals.marks)} (${percent(totals.score, totals.marks)})`]);
    $('paper-scores').replaceChildren(...rowsOf(rows));

    // Scope papers: marks per topic, weakest (lowest share) first, so weak topics stand out.
    $('topic-title').hidden = $('topic-scores').hidden = !scope;
    if (scope) {
      const topics = [...new Set(round.map(item => String(item.q.lecture)))].map(topic => {
        const items = round.filter(item => String(item.q.lecture) === topic);
        const marks = sum(items, i => marksOf(i.q));
        return {name: Quizy.lectureName(topic, state.subject), items, marks, score: sum(items, i => i.score || 0), n: Number(topic)};
      }).sort((a, b) => a.score / a.marks - b.score / b.marks || a.n - b.n);
      $('topic-scores').replaceChildren(...rowsOf(topics.map(t => [t.name, `${marksLine(t.items, t.marks)} (${percent(t.score, t.marks)})`])));
    }

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
        el('span', 'missed-marks', `${formatMarks(item.score || 0)} / ${formatMarks(marksOf(item.q))} · `
          + (scope ? paper.sections.find(s => s.key === item.section).name : `Section ${paper.sections.find(s => s.key === item.section).letter}`)));
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
