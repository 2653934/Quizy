'use strict';

// localStorage wrapper. Every access is wrapped in try/catch so the quiz stays usable when
// browser storage is unavailable. Keys and formats must not change (they hold the owner's progress):
//   quizy-attempts-v2-<subject>  {[questionId]: {correct, score, at}}
//   quizy-dve-attempts-v1        old DVE progress, copied to v2 once (and kept)
//   quizy-last-subject           key of the subject shown last
//   quizy-written-v1-<subject>   {[questionId]: text} typed for "written" questions, restored when they reappear
//   quizy-lectures-v1-<subject>  ["5", "6"]: the lecture chips chosen last ([] for all lectures)
//   quizy-color-mode-v1          "light" or "dark" once chosen with the sidebar control (missing: follow the system)
//   quizy-sidebar-v1             "collapsed" or "expanded": the desktop sidebar
// src/ui/theme.js and src/ui/sidebar.js read the last two before the page is drawn, so this file loads in <head>.
(function (Quizy) {
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Quiz remains usable if browser storage is unavailable. */ } }
  };
  const attemptsKey = subject => `quizy-attempts-v2-${subject}`;

  Quizy.storage = {
    // DVE progress from v1 carries over (question ids are unchanged).
    migrate() {
      if (store.get(attemptsKey('dve')) === null) {
        const old = store.get('quizy-dve-attempts-v1');
        if (old !== null) store.set(attemptsKey('dve'), old);
      }
    },
    loadAttempts(subject) {
      try { return JSON.parse(store.get(attemptsKey(subject)) || '{}') || {}; }
      catch { return {}; }
    },
    saveAttempts(subject, attempts) { store.set(attemptsKey(subject), JSON.stringify(attempts)); },
    loadWritten(subject) {
      try { return JSON.parse(store.get(`quizy-written-v1-${subject}`) || '{}') || {}; }
      catch { return {}; }
    },
    saveWritten(subject, texts) { store.set(`quizy-written-v1-${subject}`, JSON.stringify(texts)); },
    loadLectures(subject) {
      try {
        const list = JSON.parse(store.get(`quizy-lectures-v1-${subject}`) || '[]');
        return Array.isArray(list) ? list.map(String) : [];
      } catch { return []; }
    },
    saveLectures(subject, lectures) { store.set(`quizy-lectures-v1-${subject}`, JSON.stringify(lectures)); },
    lastSubject() { return store.get('quizy-last-subject'); },
    setLastSubject(subject) { store.set('quizy-last-subject', subject); },
    // null until a mode is chosen (anything unexpected counts as no choice).
    colorMode() {
      const mode = store.get('quizy-color-mode-v1');
      return mode === 'light' || mode === 'dark' ? mode : null;
    },
    setColorMode(mode) { store.set('quizy-color-mode-v1', mode); },
    sidebarCollapsed() { return store.get('quizy-sidebar-v1') === 'collapsed'; },
    setSidebarCollapsed(collapsed) { store.set('quizy-sidebar-v1', collapsed ? 'collapsed' : 'expanded'); }
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
