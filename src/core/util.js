'use strict';

// Small helpers shared by every file. Node-safe: nothing here touches the DOM until it is called.
(function (Quizy) {
  Quizy.$ = id => document.getElementById(id);

  Quizy.el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Writes text into node, bolding whole-word matches of `words`. Never changes the text itself.
  Quizy.richText = function (node, text, words) {
    node.replaceChildren();
    if (!words || !words.length) { node.textContent = text; return; }
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = text.split(new RegExp(`\\b(${escaped.join('|')})\\b`, 'g'));
    parts.forEach((part, i) => node.append(i % 2 ? Quizy.el('strong', '', part) : document.createTextNode(part)));
  };

  // Fisher-Yates on a copy, using Quizy.random (src/core/random.js).
  Quizy.shuffle = function (items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Quizy.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  Quizy.order = n => [...Array(n).keys()];

  Quizy.plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  Quizy.formatMarks = n => String(Math.round(n * 100) / 100);
  Quizy.letter = i => String.fromCharCode(97 + i) + '.';

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
