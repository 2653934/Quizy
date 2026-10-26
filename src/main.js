'use strict';

// Boot: load data → migrate storage → build the subject list → wire events → show the last subject.
// (src/ui/theme.js and src/ui/sidebar.js already set the colour mode and sidebar state from <head>.)
(async function (Quizy) {
  const {$, ui, state, storage} = Quizy;
  ui.wireColorMode();
  ui.wireSidebar();

  const data = await Quizy.loadData();
  if (!data || !Array.isArray(data.subjects) || !data.subjects.length) {
    $('bank-note').textContent = 'The question bank could not be loaded.';
    $('start').disabled = true;
    $('generate').disabled = true;
    $('browse-open').disabled = true;
    return;
  }
  state.data = data;

  storage.migrate();
  ui.buildSubjectTabs();

  $('set').addEventListener('change', ui.chooseSet);
  $('style').addEventListener('change', ui.updateNote);
  $('mode').addEventListener('change', ui.updateNote);
  $('start').addEventListener('click', ui.start);
  $('generate').addEventListener('click', ui.generatePaper);
  $('replay').addEventListener('click', ui.replayPaper);
  $('paper-code').addEventListener('keydown', event => { if (event.key === 'Enter') ui.replayPaper(); });
  $('continue').addEventListener('click', ui.resume);
  $('interlude-quit').addEventListener('click', ui.backToSetup);
  $('retry-missed').addEventListener('click', ui.retryMissed);
  $('check').addEventListener('click', ui.check);
  $('next').addEventListener('click', ui.next);
  $('copy-claude').addEventListener('click', ui.copyForClaude);
  $('quit').addEventListener('click', ui.endRound);
  $('again').addEventListener('click', ui.backToSetup);
  ui.wireBrowse();

  ui.chooseSubject(storage.lastSubject());
  ui.openFromHash();
})(window.Quizy);
