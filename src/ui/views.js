'use strict';

// Switching between the setup, browse, answer (one question from the browse list), quiz, interlude
// (between the sections of a mock paper) and summary panels.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$} = Quizy;
  // body[data-view] for each panel: the interlude is still part of the round, so it looks like the quiz view,
  // and the answer view is part of browsing.
  const MODES = {interlude: 'quiz', answer: 'browse'};

  ui.view = 'setup';

  // top: where to scroll to (a number restores a position instantly, e.g. the browse list); default smooth to the top.
  ui.show = function (view, top) {
    for (const id of ['setup', 'browse', 'answer', 'quiz', 'interlude', 'summary']) $(id).hidden = id !== view;
    ui.view = view;
    const mode = MODES[view] || view;
    ui.lockSubjectTabs(mode === 'quiz');
    // styles/views.css hides the hero and stats and compacts the header while body[data-view=quiz] (and browse).
    document.body.dataset.view = mode;
    if (top === undefined) window.scrollTo({top: 0, behavior: 'smooth'});
    else window.scrollTo({top, behavior: 'instant'});
  };
})(window.Quizy = window.Quizy || {});
