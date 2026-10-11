'use strict';

// Boot: load data → migrate storage → build the subject tabs → wire events → show the last subject.
(async function (Quizy) {
  const {$, ui, state, storage} = Quizy;

  const data = await Quizy.loadData();
  if (!data || !Array.isArray(data.subjects) || !data.subjects.length) {
    $('bank-note').textContent = 'The question bank could not be loaded.';
    $('start').disabled = true;
    return;
  }
  state.data = data;

  storage.migrate();
  ui.buildSubjectTabs();

  $('set').addEventListener('change', ui.chooseSet);
  $('lecture').addEventListener('change', ui.updateNote);
  $('mode').addEventListener('change', ui.updateNote);
  $('start').addEventListener('click', ui.start);
  $('check').addEventListener('click', ui.check);
  $('next').addEventListener('click', ui.next);
  $('copy-claude').addEventListener('click', ui.copyForClaude);
  $('quit').addEventListener('click', ui.backToSetup);
  $('again').addEventListener('click', ui.backToSetup);

  ui.chooseSubject(storage.lastSubject());
})(window.Quizy);
