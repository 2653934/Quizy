'use strict';

// Subject theme colours for light and dark mode. data/subjects.json gives four light colours per subject
// (accent, paper, light, aside); every other subject-dependent token is mixed from them here.
// src/ui/theme.js applies the result; tests/prefs.test.cjs checks the contrast of every subject in both modes.
// Tokens that don't depend on the subject (--ink, --muted, --edge, the feedback colours…) live in styles/tokens.css.
(function (Quizy) {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  // t of a and (1 − t) of b.
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
  const luminance = h => {
    const [r, g, b] = hex(h).map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // WCAG contrast ratio of two #rrggbb colours (1 to 21).
  const contrastRatio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  Quizy.mixColors = mix;
  Quizy.contrastRatio = contrastRatio;

  Quizy.COLOR_MODES = ['light', 'dark'];
  // A saved choice wins; otherwise follow the operating system.
  Quizy.resolveColorMode = (saved, systemDark) => Quizy.COLOR_MODES.includes(saved) ? saved : (systemDark ? 'dark' : 'light');

  // The CSS custom properties for a subject's theme in one mode, as {'--name': '#rrggbb'}.
  // Light mode gives exactly the tokens the app has always set, so the light look is unchanged.
  Quizy.themeTokens = function (theme, mode) {
    const {accent, paper, light, aside} = theme;
    if (mode !== 'dark') {
      return {
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
    }
    // Dark: near-black surfaces with a hint of the accent. The accent itself stays as the fill colour
    // (buttons, chosen tabs and chips keep white text); --accent-text is a lighter mix for accent-coloured text.
    const surfaces = {
      '--paper': mix(accent, '#12181a', 0.07),
      '--aside': mix(accent, '#0e1315', 0.1),
      '--surface': mix(accent, '#1a2124', 0.08),
      '--choice-bg': mix(accent, '#1e2629', 0.09),
      '--field-bg': mix(accent, '#161d1f', 0.06),
      '--light': mix(accent, '#1e2629', 0.3)
    };
    let accentText = accent;
    for (let t = 1; t > 0 && Object.values(surfaces).some(bg => contrastRatio(accentText, bg) < 4.6); t -= 0.02) accentText = mix(accent, '#ffffff', t);
    return {
      '--accent': accent,
      ...surfaces,
      '--accent-dark': mix(accent, '#000000', 0.85),
      '--accent-text': accentText,
      '--seal': mix(accent, '#1a2124', 0.3),
      '--line': mix(accent, '#3b4548', 0.22),
      '--track': mix(accent, '#2a3235', 0.25),
      '--shadow': mix(accent, '#12181a', 0.35),
      '--field-line': mix(accent, '#77868a', 0.25)
    };
  };

  // <meta name="theme-color">: the accent in light mode, the dark side-panel colour in dark mode.
  Quizy.themeColor = (theme, mode) => mode === 'dark' ? Quizy.themeTokens(theme, 'dark')['--aside'] : theme.accent;

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
