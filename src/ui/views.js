'use strict';

// Switching between the setup, quiz, interlude (between the sections of a mock paper) and summary panels.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$} = Quizy;

  ui.show = function (view) {
    for (const id of ['setup', 'quiz', 'interlude', 'summary']) $(id).hidden = id !== view;
    // The interlude is still part of the round, so it looks like the quiz view.
    const mode = view === 'interlude' ? 'quiz' : view;
    ui.lockSubjectTabs(mode === 'quiz');
    // styles/views.css hides the hero and stats and compacts the header while body[data-view=quiz].
    document.body.dataset.view = mode;
    window.scrollTo({top: 0, behavior: 'smooth'});
  };
})(window.Quizy = window.Quizy || {});
