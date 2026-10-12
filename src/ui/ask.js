'use strict';

// "Copy for Claude": copies a marking prompt (src/core/prompt.js) for types that define askClaude.
// No network calls: the user pastes the prompt into Claude themselves.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const {$, state} = Quizy;
  let prompt = '';

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

  // The button says text for 2 seconds, then "Copy for Claude" again.
  const timers = new Map();
  function setLabel(button, text) {
    clearTimeout(timers.get(button));
    button.textContent = text;
    timers.set(button, setTimeout(() => { button.textContent = 'Copy for Claude'; }, 2000));
  }
  function resetButton(button, fallback) {
    clearTimeout(timers.get(button));
    button.textContent = 'Copy for Claude';
    fallback.hidden = true;
  }

  // Copies text and says so on the button; if both ways fail, shows the text in the fallback box to copy by hand.
  async function copyWith(button, fallback, text) {
    if (await copyText(text)) return setLabel(button, 'Copied ✓');
    setLabel(button, 'Couldn’t copy. Select the text below.');
    fallback.value = text;
    fallback.hidden = false;
    fallback.select();
  }

  // Shows the button for this question and response, or hides it when the type has no askClaude.
  ui.showAsk = function (q, response) {
    const type = Quizy.types[q.type];
    $('ask').hidden = !type.askClaude;
    resetButton($('copy-claude'), $('ask-fallback'));
    if (!type.askClaude) return;
    prompt = Quizy.claudePrompt({subject: state.subject, set: Quizy.currentItem().set, q, ...type.askClaude(q, response)});
  };
  ui.hideAsk = function () { $('ask').hidden = true; };

  ui.copyForClaude = () => copyWith($('copy-claude'), $('ask-fallback'), prompt);

  // The browse view's answer panel has its own button and fallback box.
  ui.resetCopyButton = resetButton;
  ui.copyWith = copyWith;
})(window.Quizy = window.Quizy || {});
