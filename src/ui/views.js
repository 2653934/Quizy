'use strict';

// Switching between the setup, quiz and summary panels.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$} = Quizy;

  ui.show = function (view) {
    for (const id of ['setup', 'quiz', 'summary']) $(id).hidden = id !== view;
    ui.lockSubjectTabs(view === 'quiz');
    // styles/views.css hides the hero and stats and compacts the header while body[data-view=quiz].
    document.body.dataset.view = view;
    window.scrollTo({top: 0, behavior: 'smooth'});
  };
})(window.Quizy = window.Quizy || {});
