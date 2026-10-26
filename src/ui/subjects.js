'use strict';

// The subject list in the sidebar (DVE / NLP / DO) and the page text that names the current subject.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, el, plural, state, storage} = Quizy;

  // One button per subject: the key as a badge, then the name and course code (only the badge, with the
  // full name as its tooltip, when the desktop sidebar is collapsed; the text stays for screen readers).
  ui.buildSubjectTabs = function () {
    for (const s of state.data.subjects) {
      const short = s.key.toUpperCase();
      const tab = el('button', 'subject-tab');
      tab.type = 'button';
      tab.dataset.key = s.key;
      tab.title = `${s.code} · ${s.name}`;
      const text = el('span', 'subject-text');
      if (s.name.toUpperCase() !== short) text.append(el('span', 'subject-name', s.name));
      if (s.code !== short) text.append(el('small', '', s.code));
      tab.append(el('b', '', short), text);
      tab.addEventListener('click', () => {
        // On phones the list is in the menu panel: close it after a choice (first, as switching while
        // browsing redraws the view, which closes the menu without moving focus).
        ui.closeMenu(true);
        if (s.key !== state.subject.key) ui.chooseSubject(s.key);
      });
      $('subjects').append(tab);
    }
  };

  // The subject list is disabled during a round.
  ui.lockSubjectTabs = function (locked) {
    for (const tab of $('subjects').children) tab.disabled = locked;
  };

  ui.chooseSubject = function (key) {
    const subject = Quizy.selectSubject(key, storage.loadAttempts);
    storage.setLastSubject(subject.key);

    ui.applyTheme(subject.theme);
    const short = subject.key.toUpperCase();
    document.title = `Quizy · ${short} study room`;
    $('side-current').textContent = short;
    $('side-code').textContent = subject.code;
    $('side-name').textContent = subject.name;
    $('side-sets').textContent = state.sets.length ? plural(state.sets.length, 'quiz set') : 'No quizzes yet';
    $('topline-label').textContent = `${subject.code} / TEST PRACTICE`;
    $('topline-pill').textContent = `${short} · ${plural(state.sets.length, 'quiz set')}`;
    $('hero-eyebrow').textContent = `The ${short} study room`;
    for (const tab of $('subjects').children) tab.setAttribute('aria-pressed', String(tab.dataset.key === subject.key));

    ui.showSets();
    // Switching subject while browsing shows the new subject's questions.
    if (ui.view === 'browse' || ui.view === 'answer') ui.openBrowse();
  };
})(window.Quizy = window.Quizy || {});
