'use strict';

// The subject switcher (DVE / NLP / DO) and the page text that names the current subject.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, state, storage} = Quizy;

  ui.buildSubjectTabs = function () {
    for (const s of state.data.subjects) {
      const tab = el('button', 'subject-tab');
      tab.type = 'button';
      tab.dataset.key = s.key;
      tab.title = `${s.code} · ${s.name}`;
      tab.append(el('b', '', s.key.toUpperCase()));
      if (s.code !== s.key.toUpperCase()) tab.append(el('small', '', s.code));
      tab.addEventListener('click', () => { if (s.key !== state.subject.key) ui.chooseSubject(s.key); });
      $('subjects').append(tab);
    }
  };

  // The switcher is disabled during a round.
  ui.lockSubjectTabs = function (locked) {
    for (const tab of $('subjects').children) tab.disabled = locked;
  };

  ui.chooseSubject = function (key) {
    const subject = Quizy.selectSubject(key, storage.loadAttempts);
    storage.setLastSubject(subject.key);

    ui.applyTheme(subject.theme);
    const short = subject.key.toUpperCase();
    document.title = `Quizy · ${short} study room`;
    $('side-code').textContent = subject.code;
    $('side-name').textContent = subject.name;
    $('topline-label').textContent = `${subject.code} / TEST PRACTICE`;
    $('topline-pill').textContent = `${short} · ${plural(state.sets.length, 'quiz set')}`;
    $('hero-eyebrow').textContent = `The ${short} study room`;
    for (const tab of $('subjects').children) tab.setAttribute('aria-pressed', String(tab.dataset.key === subject.key));

    ui.showSets();
    // Switching subject while browsing shows the new subject's questions.
    if (ui.view === 'browse' || ui.view === 'answer') ui.openBrowse();
  };
})(window.Quizy = window.Quizy || {});
