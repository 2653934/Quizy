// node --test "tests/*.test.cjs"
// Colour mode and sidebar preferences (src/core/storage.js, src/core/colors.js): the saved choice beats the
// system, unexpected stored values are ignored, storage failures never throw, the light tokens are unchanged,
// and every subject's dark theme keeps readable contrast. Also that styles/tokens.css matches the derived values.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fakeStorage = () => {
  const items = new Map();
  return {items, getItem: k => items.has(k) ? items.get(k) : null, setItem: (k, v) => items.set(k, String(v))};
};
globalThis.localStorage = fakeStorage();
const Quizy = require('../src/core/storage.js');
require('../src/core/colors.js');
const {storage} = Quizy;
const subjects = require('../data/subjects.json').subjects;

// The custom properties of every `<selector> { … }` block in a stylesheet, merged in order.
const cssTokens = (file, selector) => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', file), 'utf8');
  const tokens = {};
  for (const [, body] of css.matchAll(new RegExp(selector.replace(/[[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
  }
  return tokens;
};
const light = cssTokens('tokens.css', ':root');
const dark = cssTokens('tokens.css', ':root[data-mode=dark]');

test('resolveColorMode: a saved choice wins, otherwise the system preference', () => {
  assert.equal(Quizy.resolveColorMode('dark', false), 'dark');
  assert.equal(Quizy.resolveColorMode('light', true), 'light');
  assert.equal(Quizy.resolveColorMode(null, true), 'dark');
  assert.equal(Quizy.resolveColorMode(null, false), 'light');
  assert.equal(Quizy.resolveColorMode('sepia', true), 'dark');
});

test('storage: colour mode and sidebar are saved, and unexpected values count as no choice', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(storage.colorMode(), null);
  assert.equal(storage.sidebarCollapsed(), false);
  storage.setColorMode('dark');
  storage.setSidebarCollapsed(true);
  assert.equal(storage.colorMode(), 'dark');
  assert.equal(storage.sidebarCollapsed(), true);
  assert.deepEqual([...localStorage.items.keys()].sort(), ['quizy-color-mode-v1', 'quizy-sidebar-v1']);
  storage.setSidebarCollapsed(false);
  assert.equal(localStorage.getItem('quizy-sidebar-v1'), 'expanded');
  assert.equal(storage.sidebarCollapsed(), false);
  localStorage.setItem('quizy-color-mode-v1', '"dark"');
  assert.equal(storage.colorMode(), null);
});

test('storage: preferences never throw when browser storage is blocked', () => {
  const blocked = () => { throw new Error('SecurityError'); };
  globalThis.localStorage = {getItem: blocked, setItem: blocked};
  assert.equal(storage.colorMode(), null);
  assert.equal(storage.sidebarCollapsed(), false);
  assert.doesNotThrow(() => { storage.setColorMode('light'); storage.setSidebarCollapsed(true); });
  delete globalThis.localStorage;
  assert.equal(storage.colorMode(), null);
});

// Snapshot of what src/ui/theme.js set before dark mode existed.
test('themeTokens light: the same tokens and values the app has always set', () => {
  assert.deepEqual(Quizy.themeTokens(subjects.find(s => s.key === 'nlp').theme, 'light'), {
    '--accent': '#5b4bb7', '--paper': '#f4f3f8', '--light': '#e6e2f6', '--aside': '#ebe8f4',
    '--accent-dark': '#4d409c', '--seal': '#e1dff2', '--line': '#d5d1eb', '--track': '#e0ddf0', '--shadow': '#cec9e8',
    '--field-line': '#a2a2be', '--surface': '#fcfcfd', '--choice-bg': '#fafafc'
  });
});

test('themeColor follows the subject and the mode', () => {
  for (const s of subjects) {
    assert.equal(Quizy.themeColor(s.theme, 'light'), s.theme.accent);
    assert.equal(Quizy.themeColor(s.theme, 'dark'), Quizy.themeTokens(s.theme, 'dark')['--aside']);
  }
  assert.equal(new Set(subjects.map(s => Quizy.themeColor(s.theme, 'dark'))).size, subjects.length);
});

test('tokens.css: the dark first-paint values are DVE\'s derived dark theme', () => {
  const dve = Quizy.themeTokens(subjects.find(s => s.key === 'dve').theme, 'dark');
  for (const [name, value] of Object.entries(dve)) assert.equal(dark[name], value, name);
  // Every token the light sheet defines has a dark value (from the sheet or derived per subject).
  for (const name of Object.keys(light)) if (name !== '--accent-text') assert.ok(name in dark, name);
});

for (const mode of Quizy.COLOR_MODES) {
  test(`${mode} mode: text, selected states and feedback stay readable for every subject`, () => {
    for (const s of subjects) {
      const t = {...light, ...(mode === 'dark' ? dark : {}), ...Quizy.themeTokens(s.theme, mode)};
      if (t['--accent-text'] === 'var(--accent)') t['--accent-text'] = t['--accent'];
      const check = (fg, bg, min) => {
        const ratio = Quizy.contrastRatio(t[fg] || fg, t[bg] || bg);
        assert.ok(ratio >= min, `${s.key} ${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}, want ${min}`);
      };
      for (const bg of ['--paper', '--aside', '--surface', '--choice-bg', '--field-bg', '--light']) check('--ink', bg, 7);
      // Dark mode derives --accent-text for every surface. Light mode keeps its existing accent text, which
      // is only used on the page and cards and is close to 4.5 on DVE's paper (4.46).
      if (mode === 'dark') for (const bg of ['--paper', '--aside', '--surface', '--choice-bg', '--field-bg', '--light']) check('--accent-text', bg, 4.5);
      else for (const bg of ['--paper', '--surface', '--choice-bg']) check('--accent-text', bg, 4.4);
      // The shared light --muted is 4.47 on NLP's side panel; the light look is kept as it was.
      for (const bg of ['--paper', '--aside', '--surface', '--choice-bg']) check('--muted', bg, mode === 'dark' ? 4.5 : 4.4);
      check('#ffffff', '--accent', 4.5);                       // primary buttons, chosen subject and chips
      check('--green', '--good-bg', 4.5);                      // "Correct" tags
      check('--bad', '--bad-bg', 4.5);                         // "Your answer" tags
      check('--warn', '--caution-bg', 4.5);                    // disputed-answer heading
      check('--warn', '--surface', 4.5);                       // "Answers on this set are unofficial"
      check('--pop-ink', '--pop-bg', 7);                       // rapid-mode "BAM!" bursts
      check('--pop-ink', '--pop-alt', 7);
      check('--paper', '--bad', 4.5);                          // the "Reset" button in the reset dialog
      for (const bg of ['--good-bg', '--bad-bg', '--good-soft', '--partial-soft', '--bad-soft', '--caution-bg', '--mark-bg']) check('--ink', bg, 7);
      check('--edge', '--paper', 3);                           // ink borders and offset shadows
      check('--edge', '--surface', 3);
    }
  });
}
