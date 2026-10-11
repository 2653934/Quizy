'use strict';

// Subject themes. data/subjects.json gives four colours; the rest are mixed from them.
// styles/tokens.css holds the DVE values for first paint. Don't hard-code theme colours in CSS.
(function (Quizy) {
  const ui = Quizy.ui = Quizy.ui || {};

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');

  // Sets the CSS tokens on :root, the browser theme colour and the favicon.
  ui.applyTheme = function (theme) {
    const {accent, paper, light, aside} = theme;
    const tokens = {
      '--accent': accent, '--paper': paper, '--light': light, '--aside': aside,
      '--accent-dark': mix(accent, '#000000', 0.85),
      '--seal': mix(accent, '#ffffff', 0.18),
      '--line': mix(accent, paper, 0.2),
      '--track': mix(accent, paper, 0.13),
      '--shadow': mix(accent, paper, 0.25),
      '--field-line': mix(mix(accent, '#213438', 0.5), paper, 0.45),
      '--surface': mix(paper, '#ffffff', 0.25),
      '--choice-bg': mix(paper, '#ffffff', 0.45)
    };
    for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value);
    document.querySelector('meta[name="theme-color"]').content = accent;
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="14" fill="${accent}" stroke="#213438" stroke-width="4"/><text x="32" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="45" font-weight="bold" fill="#ffffff">q</text></svg>`;
    document.querySelector('link[rel="icon"]').href = 'data:image/svg+xml,' + encodeURIComponent(icon);
  };
})(window.Quizy = window.Quizy || {});
