'use strict';

// localStorage wrapper. Every access is wrapped in try/catch so the quiz stays usable when
// browser storage is unavailable. Keys and formats must not change (they hold the owner's progress):
//   quizy-attempts-v2-<subject>  {[questionId]: {correct, score, at}}
//   quizy-dve-attempts-v1        old DVE progress, copied to v2 once (and kept)
//   quizy-last-subject           key of the subject shown last
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
    lastSubject() { return store.get('quizy-last-subject'); },
    setLastSubject(subject) { store.set('quizy-last-subject', subject); }
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
