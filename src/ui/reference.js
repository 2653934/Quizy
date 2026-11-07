'use strict';

// "Model sheet": a read-only reference card for every model and algorithm of the subject's scope
// (data/<subject>/reference.json, checked by src/core/reference.js). Topic chips (sticky) jump to a topic,
// every card folds open and shut, and the search filters the cards. Opened from the setup screen, or by
// #ref=<card id> in the URL (ignored during a round). "Practise these questions" opens Browse on that topic.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, state} = Quizy;
  const KIND = {model: 'Model', algorithm: 'Algorithm', concept: 'Concept'};

  let built = null;          // the reference drawn in #ref-cards
  let query = '';
  const collapsed = new Set(); // ids of the cards folded shut (kept while the app is open)
  let sheetTop = 0;          // the scroll position, restored when coming back from Browse
  let timer = null;

  ui.referenceOf = subject => (subject?.reference && state.data?.references?.[subject.reference]) || null;
  const cardNode = id => document.getElementById(`card-${id}`);
  const topicName = n => Quizy.lectureName(n, state.subject);

  function setHash(id) {
    try { history.replaceState(null, '', id ? `#ref=${encodeURIComponent(id)}` : location.pathname + location.search); }
    catch { /* not allowed here (some file:// setups): the link just isn't updated */ }
  }

  // A formula as its own block (scrolls sideways inside its box when too wide).
  const formula = tex => Quizy.mathNode(tex, true);
  const rich = (tag, className, text, terms) => {
    const node = el(tag, className);
    Quizy.richText(node, text, null, terms);
    return node;
  };
  const heading = text => el('div', 'eyebrow ref-label', text);

  function modelBlock(model, terms) {
    const vars = el('dl', 'ref-vars');
    for (const v of model.variables) {
      const row = el('div');
      const dt = el('dt');
      dt.append(Quizy.mathNode(v.math, false));
      row.append(dt, rich('dd', '', v.meaning, terms));
      vars.append(row);
    }
    const constraints = el('ol', 'ref-constraints');
    for (const c of model.constraints) {
      const li = el('li');
      li.append(formula(c.math), rich('p', 'ref-meaning', c.meaning, terms));
      constraints.append(li);
    }
    const objective = el('div', 'ref-objective');
    objective.append(formula(model.objective));
    return [heading('Variables'), vars, heading('Objective'), objective, heading('Subject to'), constraints];
  }

  function figure(image) {
    const node = el('figure', 'figure ref-figure');
    const link = el('a');
    link.href = image.src;
    link.target = '_blank';
    link.rel = 'noopener';
    const img = el('img');
    img.src = image.src;
    img.alt = image.alt;
    // The pixel size reserves the image's space, so lazy loading doesn't move the page (or a topic jump).
    img.width = image.width;
    img.height = image.height;
    img.loading = 'lazy';
    link.append(img);
    node.append(link, el('figcaption', '', 'Tap the image to open it full size.'));
    return node;
  }

  function card(c, terms) {
    const details = el('details', 'ref-card');
    details.id = `card-${c.id}`;
    details.open = !collapsed.has(c.id) || terms.length > 0;
    const summary = el('summary');
    summary.append(el('span', `ref-kind ${c.kind}`, KIND[c.kind]), rich('span', 'ref-card-title', c.title, terms));
    const body = el('div', 'ref-body');
    body.append(rich('p', 'ref-summary', c.summary, terms));
    if (c.model) body.append(...modelBlock(c.model, terms));
    const list = (tag, className, label, items) => {
      const node = el(tag, className);
      node.append(...items.map(text => rich('li', '', text, terms)));
      body.append(heading(label), node);
    };
    if (c.steps) list('ol', 'ref-steps', 'Steps', c.steps);
    if (c.points) list('ul', 'ref-points', 'Key points', c.points);
    body.append(...c.images.map(figure));
    if (c.example) {
      const example = el('div', 'ref-example');
      example.append(heading('Example'), rich('p', '', c.example, terms));
      body.append(example);
    }
    body.append(rich('p', 'ref-source', `Source: ${c.source}`, terms));
    const count = Quizy.allQuestions().filter(q => String(q.lecture) === String(c.topic)).length;
    if (count) {
      const practise = el('button', 'quiet ref-practise', `Practise these questions (${count}) →`);
      practise.type = 'button';
      practise.addEventListener('click', () => {
        sheetTop = window.scrollY;
        ui.openBrowse({lectures: [String(c.topic)], from: 'reference'});
      });
      body.append(practise);
    }
    details.append(summary, body);
    details.addEventListener('toggle', () => {
      if (details.open) collapsed.delete(c.id); else collapsed.add(c.id);
      updateToggle();
    });
    return details;
  }

  // Topic sections in scope order, then the cards of the other topics under the reference's extraTitle.
  function draw() {
    const ref = built;
    const terms = Quizy.searchTerms(query);
    // The chip shows the topic's name ("L5" without subject topic names); the heading adds the sheet's topicTitles.
    const groups = ref.scopeTopics.map(n => ({n, chip: topicName(n), title: ref.topicTitles?.[String(n)] ? `${topicName(n)} · ${ref.topicTitles[String(n)]}` : topicName(n), cards: []}));
    const extra = {n: 'extra', title: ref.extraTitle || 'Other', cards: []};
    for (const c of ref.cards) (groups.find(g => g.n === c.topic) || extra).cards.push(c);
    if (extra.cards.length) groups.push(extra);
    let shown = 0;
    const sections = groups.map(g => {
      const matching = g.cards.filter(c => Quizy.cardMatches(c, terms, state.subject));
      shown += matching.length;
      const section = el('section', 'ref-topic');
      section.id = `ref-topic-${g.n}`;
      section.hidden = !matching.length;
      section.append(el('h3', 'ref-topic-title', g.title), ...matching.map(c => card(c, terms)));
      return section;
    });
    $('ref-cards').replaceChildren(...sections);
    // A chip per scope topic; one whose cards are all filtered out by the search is disabled.
    $('ref-topics').replaceChildren(...groups.filter(g => g.n !== 'extra').map(g => {
      const chip = el('button', 'chip', g.chip);
      chip.type = 'button';
      chip.disabled = sections[groups.indexOf(g)].hidden;
      chip.addEventListener('click', () => jumpTo($(`ref-topic-${g.n}`)));
      return chip;
    }));
    const total = ref.cards.length;
    $('ref-count').textContent = terms.length
      ? `${shown} of ${plural(total, 'card')}` + (shown ? '' : '. Nothing matches: try fewer words.')
      : plural(total, 'card');
    updateToggle();
  }

  // Scrolls a topic or card below the sticky chip row.
  function jumpTo(node, behavior) {
    if (!node) return;
    const bar = $('ref-topics').getBoundingClientRect().height;
    const top = node.getBoundingClientRect().top + window.scrollY - bar - 10;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top, behavior: behavior || (smooth ? 'smooth' : 'instant')});
  }

  const visibleCards = () => [...$('ref-cards').querySelectorAll('.ref-topic:not([hidden]) .ref-card')];

  function updateToggle() {
    const cards = visibleCards();
    const allOpen = cards.length > 0 && cards.every(d => d.open);
    $('ref-toggle').textContent = allOpen ? 'Collapse all' : 'Expand all';
    $('ref-toggle').disabled = !cards.length;
  }

  function toggleAll() {
    const cards = visibleCards();
    const open = !cards.every(d => d.open);
    for (const d of cards) d.open = open; // each fires 'toggle', which updates `collapsed` and the button
  }

  // "Model sheet →" on the setup screen (and after switching subject while the sheet is open).
  ui.openReference = function () {
    const ref = ui.referenceOf(state.subject);
    if (!ref) return ui.backToSetup();
    if (built !== ref) {
      built = ref;
      query = '';
      collapsed.clear();
    }
    $('ref-title').textContent = ref.title;
    Quizy.richText($('ref-description'), ref.description || '');
    $('ref-search').value = query;
    // The sheet's own example terms ("e.g. subtour, Metropolis"); a neutral hint without them.
    $('ref-search').placeholder = ref.searchHint ? `e.g. ${ref.searchHint}` : 'Search the cards';
    draw();
    setHash(null);
    ui.show('reference');
  };

  // Back from Browse ("← Back to the model sheet"), where it was.
  ui.backToReference = function () {
    if (!ui.referenceOf(state.subject)) return ui.backToSetup();
    draw();
    ui.show('reference', sheetTop);
  };

  // The setup screen shows "Model sheet →" only for subjects that have one.
  ui.showReferenceButton = function () {
    $('reference-open').hidden = !ui.referenceOf(state.subject);
  };

  // #ref=<card id>: opens the sheet at that card (switching subject if needed). Ignored during a round.
  ui.openReferenceFromHash = function () {
    const match = /^#ref=(.+)$/.exec(location.hash);
    if (!match || ui.view === 'quiz' || ui.view === 'interlude') return;
    const id = decodeURIComponent(match[1]);
    const subject = state.data.subjects.find(s => ui.referenceOf(s)?.cards.some(c => c.id === id));
    if (!subject) return;
    if (subject.key !== state.subject.key) ui.chooseSubject(subject.key);
    ui.openReference();
    query = '';
    $('ref-search').value = '';
    collapsed.delete(id);
    draw();
    setHash(id);
    const node = cardNode(id);
    node.classList.add('ref-target');
    // After the view switch (which scrolls to the top) has started.
    requestAnimationFrame(() => jumpTo(node, 'instant'));
  };

  ui.wireReference = function () {
    $('reference-open').addEventListener('click', ui.openReference);
    $('ref-close').addEventListener('click', () => { setHash(null); ui.backToSetup(); });
    $('ref-toggle').addEventListener('click', toggleAll);
    $('ref-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { query = $('ref-search').value; draw(); }, 150);
    });
    window.addEventListener('hashchange', ui.openReferenceFromHash);
  };
})(window.Quizy = window.Quizy || {});
