'use strict';

// "Copy for Claude": copies a marking prompt (src/core/prompt.js) for types that define askClaude.
// No network calls: the user pastes the prompt into Claude themselves.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, state} = Quizy;
  let prompt = '';
  let timer = null;

  // The Clipboard API can be missing or blocked (file://, older phones), so fall back to execCommand.
  function legacyCopy(text) {
    const area = Quizy.el('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through to the old way */ }
    return legacyCopy(text);
  }

  function setLabel(text) {
    clearTimeout(timer);
    $('copy-claude').textContent = text;
    timer = setTimeout(() => { $('copy-claude').textContent = 'Copy for Claude'; }, 2000);
  }

  // Shows the button for this question and response, or hides it when the type has no askClaude.
  ui.showAsk = function (q, response) {
    const type = Quizy.types[q.type];
    $('ask').hidden = !type.askClaude;
    $('ask-fallback').hidden = true;
    clearTimeout(timer);
    $('copy-claude').textContent = 'Copy for Claude';
    if (!type.askClaude) return;
    prompt = Quizy.claudePrompt({subject: state.subject, set: state.roundSet, q, ...type.askClaude(q, response)});
  };
  ui.hideAsk = function () { $('ask').hidden = true; };

  ui.copyForClaude = async function () {
    if (await copyText(prompt)) return setLabel('Copied ✓');
    // Both ways failed: show the text so it can be copied by hand.
    setLabel('Couldn’t copy. Select the text below.');
    $('ask-fallback').value = prompt;
    $('ask-fallback').hidden = false;
    $('ask-fallback').select();
  };
})(window.Quizy = window.Quizy || {});
