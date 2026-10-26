'use strict';

// Subject themes and the light/dark colour mode. The tokens come from src/core/colors.js;
// styles/tokens.css holds the DVE values for first paint. Don't hard-code theme colours in CSS.
// Loaded in <head> without defer (after storage.js and colors.js), so html[data-mode] is set before the
// page is drawn and a dark-mode user doesn't see a light flash. Everything else runs later, from main.js.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let current = null; // the subject theme shown, re-applied when the mode changes
  let setNames = [];  // the custom properties set on :root last time, so a mode switch can drop the extras

  const setMode = mode => {
    ui.colorMode = mode;
    root.dataset.mode = mode;
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(mode === 'dark'));
  };

  // Sets the CSS tokens on :root, the browser theme colour and the favicon.
  ui.applyTheme = function (theme) {
    current = theme;
    const tokens = Quizy.themeTokens(theme, ui.colorMode);
    for (const name of setNames) if (!(name in tokens)) root.style.removeProperty(name);
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    setNames = Object.keys(tokens);
    document.querySelector('meta[name="theme-color"]').content = Quizy.themeColor(theme, ui.colorMode);
    const {accent} = theme;
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="14" fill="${accent}" stroke="#213438" stroke-width="4"/><text x="32" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="45" font-weight="bold" fill="#ffffff">q</text></svg>`;
    document.querySelector('link[rel="icon"]').href = 'data:image/svg+xml,' + encodeURIComponent(icon);
  };

  // The sidebar's "Dark mode" button: an explicit choice is saved and from then on wins over the system.
  ui.toggleColorMode = function () {
    const mode = ui.colorMode === 'dark' ? 'light' : 'dark';
    Quizy.storage.setColorMode(mode);
    setMode(mode);
    if (current) ui.applyTheme(current);
  };

  // Called by main.js once the markup is there: show the mode on the button.
  ui.wireColorMode = function () {
    document.getElementById('theme-toggle').addEventListener('click', ui.toggleColorMode);
    setMode(ui.colorMode);
  };

  setMode(Quizy.resolveColorMode(Quizy.storage.colorMode(), system.matches));
  // Without a saved choice, follow the system when it changes.
  system.addEventListener('change', () => {
    if (Quizy.storage.colorMode()) return;
    setMode(Quizy.resolveColorMode(null, system.matches));
    if (current) ui.applyTheme(current);
  });
})(window.Quizy = window.Quizy || {});
