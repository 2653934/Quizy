'use strict';

// "Browse all questions": the subject's question bank with search and filters (#browse), and one question
// with its answer (#answer), from where it can be practised on its own or copied for Claude.
// Opened from the setup screen only, so a round or mock paper in progress is never touched.
// The filters are kept while the app is open (per subject); #q=<id> in the URL opens that question.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, marksOf, state} = Quizy;
  const CHUNK = 40; // cards drawn at a time ("Show more")
  const TAGS = {single: 'Multiple choice', truefalse: 'True / False', multi: 'Select all', match: 'Matching',
    short: 'Short answer', numeric: 'Calculation', written: 'Written', label: 'Label'};

  let filters = null; // {subject, query, set, lectures, style, wrong}
  let results = [];   // the questions the filters select, in set order
  let shown = 0;      // how many of them are drawn
  let listTop = 0;    // the list's scroll position, restored when coming back
  let opened = null;  // the question in the answer view
  let timer = null;

  const ALL = () => ui.ALL;
  const setOf = q => state.setOf.get(q.id);
  const chosenSets = () => filters.set === ALL() ? state.sets : state.sets.filter(s => s.id === filters.set);
  const inLectures = q => !filters.lectures.length || filters.lectures.includes(String(q.lecture));

  // "L7 · Self-attention calculation · Tutorial Q5.4 · 10 marks"
  const metaLine = q => [`L${q.lecture}`, q.concept, Quizy.sourceLabel(q, setOf(q)), plural(marksOf(q), 'mark')].filter(Boolean).join(' · ');

  // The latest saved result for a question, if any.
  function lastResult(q) {
    const attempt = state.attempts[q.id];
    if (!attempt) return null;
    if (attempt.correct) return ['right', '✓ Correct last time'];
    if (attempt.score > 0) return ['partial', '◐ Partly right last time'];
    return ['wrong', '✗ Wrong last time'];
  }

  // The URL keeps #q=<id> while a question is open, so it can be shared or reloaded.
  function setHash(id) {
    try { history.replaceState(null, '', id ? `#q=${encodeURIComponent(id)}` : location.pathname + location.search); }
    catch { /* not allowed here (some file:// setups): the link just isn't updated */ }
  }

  function buildFilters() {
    const set = $('browse-set');
    set.replaceChildren(new Option(state.sets.length > 1 ? 'All sets' : state.sets[0].title, ALL()), ...(state.sets.length > 1 ? state.sets.map(s => new Option(s.title, s.id)) : []));
    set.value = filters.set;
    $('browse-search').value = filters.query;
    $('browse-wrong').checked = filters.wrong;
    buildChipsAndStyles();
  }

  function buildChipsAndStyles() {
    const pool = chosenSets().flatMap(s => s.questions);
    ui.fillChips($('browse-lectures'), filters.lectures, pool, value => {
      filters.lectures = ui.toggled(filters.lectures, value);
      buildChipsAndStyles();
      refresh();
    });
    ui.fillStyles($('browse-style'), pool.filter(inLectures), filters.style);
    filters.style = $('browse-style').value;
  }

  // Applies the filters and draws the list from the top (or the first `count` cards, when coming back).
  function refresh(count = CHUNK) {
    const terms = Quizy.searchTerms(filters.query);
    results = chosenSets().flatMap(set => set.questions.filter(q => inLectures(q)
      && (filters.style === ALL() || q.type === filters.style)
      && (!filters.wrong || state.attempts[q.id]?.correct === false)
      && Quizy.matchesSearch(q, set, terms)));
    const total = Quizy.allQuestions().length;
    $('browse-count').textContent = `${results.length} of ${plural(total, 'question')}`
      + (results.length ? '' : filters.wrong ? '. Nothing you got wrong matches these filters.' : '. Nothing matches: try fewer words or other filters.');
    $('browse-list').replaceChildren();
    shown = 0;
    showMore(count, terms);
  }

  function showMore(count = CHUNK, terms = Quizy.searchTerms(filters.query)) {
    const next = results.slice(shown, shown + count);
    $('browse-list').append(...next.map(q => card(q, terms)));
    shown += next.length;
    const left = results.length - shown;
    $('browse-more').hidden = left <= 0;
    $('browse-more').textContent = `Show ${Math.min(CHUNK, left)} more (${left} left)`;
  }

  function card(q, terms) {
    const li = el('li');
    const button = el('button', 'browse-card');
    button.type = 'button';
    const meta = el('span', 'browse-meta');
    meta.append(el('span', 'browse-tag', TAGS[q.type] || q.type), document.createTextNode(metaLine(q)));
    const text = el('span', 'browse-text');
    Quizy.richText(text, q.question, q.emphasis, terms);
    button.append(meta, text);
    const result = lastResult(q);
    if (result) button.append(el('span', `browse-result ${result[0]}`, result[1]));
    button.addEventListener('click', () => openAnswer(q));
    li.append(button);
    return li;
  }

  // "Browse all questions" (setup screen), or after switching subject while browsing.
  ui.openBrowse = function () {
    if (!state.sets.length) return ui.backToSetup();
    if (filters?.subject !== state.subject.key) {
      filters = {subject: state.subject.key, query: '', set: ALL(), lectures: ui.chosenLectures(), style: ALL(), wrong: false};
    }
    buildFilters();
    refresh();
    setHash(null);
    ui.show('browse');
  };

  // Back to the list as it was: same filters, same cards drawn, same scroll position (results may have changed).
  ui.backToBrowse = function () {
    ui.returnTo = null;
    setHash(null);
    buildChipsAndStyles();
    refresh(Math.max(shown, CHUNK));
    ui.show('browse', listTop);
  };

  function openAnswer(q) {
    if (ui.view === 'browse') listTop = window.scrollY;
    opened = q;
    const set = setOf(q);
    const type = Quizy.types[q.type];
    $('answer-set').textContent = set.title;
    $('answer-source').textContent = metaLine(q);
    Quizy.richText($('answer-question'), q.question, q.emphasis);
    $('answer-question').classList.toggle('long', q.question.length > 160);
    $('answer-figure').hidden = !q.image;
    $('answer-figure').classList.toggle('wide', !!type.wideFigure);
    if (q.image) {
      $('answer-figure-img').src = q.image.src;
      $('answer-figure-img').alt = q.image.alt;
      $('answer-figure-link').href = q.image.src;
    }
    $('answer-key').replaceChildren(...type.answerKey(q));
    $('answer-notes').replaceChildren(...ui.studyNotes(q, set));
    ui.resetCopyButton($('answer-copy'), $('answer-fallback'));
    setHash(q.id);
    ui.show('answer');
  }

  // A normal one-question round; its summary (and "End round") come back to the list.
  function practise() {
    setHash(null);
    ui.startRound(setOf(opened), [opened]);
    ui.returnTo = 'browse';
  }

  function copy() {
    const set = setOf(opened);
    ui.copyWith($('answer-copy'), $('answer-fallback'), Quizy.explainPrompt({subject: state.subject, set, q: opened, reference: Quizy.types[opened.type].reference(opened)}));
  }

  // #q=<id>: opens that question's answer (switching subject if needed). Ignored during a round.
  ui.openFromHash = function () {
    const match = /^#q=(.+)$/.exec(location.hash);
    if (!match || ui.view === 'quiz' || ui.view === 'interlude') return;
    const id = decodeURIComponent(match[1]);
    const {data} = state;
    const subject = data.subjects.find(s => s.sets.some(setId => data.sets[setId]?.questions.some(q => q.id === id)));
    if (!subject) return;
    if (subject.key !== state.subject.key) ui.chooseSubject(subject.key);
    ui.openBrowse();
    listTop = 0;
    openAnswer(state.setOf.get(id).questions.find(q => q.id === id));
  };

  ui.wireBrowse = function () {
    $('browse-open').addEventListener('click', ui.openBrowse);
    $('browse-close').addEventListener('click', () => { setHash(null); ui.backToSetup(); });
    $('browse-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { filters.query = $('browse-search').value; refresh(); }, 150);
    });
    $('browse-set').addEventListener('change', () => { filters.set = $('browse-set').value; buildChipsAndStyles(); refresh(); });
    $('browse-style').addEventListener('change', () => { filters.style = $('browse-style').value; refresh(); });
    $('browse-wrong').addEventListener('change', () => { filters.wrong = $('browse-wrong').checked; refresh(); });
    $('browse-more').addEventListener('click', () => showMore());
    $('answer-back').addEventListener('click', ui.backToBrowse);
    $('answer-practise').addEventListener('click', practise);
    $('answer-copy').addEventListener('click', copy);
    $('to-browse').addEventListener('click', ui.backToBrowse);
    window.addEventListener('hashchange', ui.openFromHash);
  };
})(window.Quizy = window.Quizy || {});
