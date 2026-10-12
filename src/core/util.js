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

  // Writes text into node: $…$ / $$…$$ maths drawn by KaTeX (see src/core/math.js), whole-word matches of
  // `words` in bold and, in the browse list, search terms in <mark>. Neither touches the maths.
  // Never changes the text itself, and text without $ or search terms is written exactly as before.
  Quizy.richText = function (node, text, words, terms) {
    node.replaceChildren();
    if (!Quizy.hasMath(text) && !terms?.length) {
      if (!words || !words.length) { node.textContent = text; return; }
      return appendText(node, text, words);
    }
    const parts = Quizy.splitMath(text);
    parts.forEach((part, i) => {
      if (part.type !== 'text') return node.append(Quizy.mathNode(part.value, part.type === 'display'));
      // A display formula is its own block, so the line breaks right beside it aren't needed.
      let value = part.value;
      if (parts[i - 1]?.type === 'display') value = value.replace(/^\n/, '');
      if (parts[i + 1]?.type === 'display') value = value.replace(/\n$/, '');
      appendText(node, value, words, terms);
    });
    node.classList.toggle('has-display-math', parts.some(part => part.type === 'display'));
  };

  // Plain text with emphasis words in <strong>, then search terms in <mark>.
  function appendText(node, text, words, terms) {
    if (!words || !words.length) return appendMarked(node, text, terms);
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = text.split(new RegExp(`\\b(${escaped.join('|')})\\b`, 'g'));
    parts.forEach((part, i) => {
      if (!(i % 2)) return appendMarked(node, part, terms);
      const strong = Quizy.el('strong');
      appendMarked(strong, part, terms);
      node.append(strong);
    });
  }

  // Marks every match of the (already folded) search terms, ignoring case and accents.
  function appendMarked(node, text, terms) {
    if (!text) return;
    if (!terms?.length) return node.append(document.createTextNode(text));
    let folded = '';
    const from = []; // from[i] = index in text of folded[i]
    let at = 0;
    for (const c of text) {
      for (const f of Quizy.fold(c)) { folded += f; from.push(at); }
      at += c.length;
    }
    from.push(text.length);
    const marked = new Array(text.length).fill(false);
    for (const term of terms) {
      for (let i = folded.indexOf(term); i >= 0; i = folded.indexOf(term, i + 1)) {
        for (let j = from[i]; j < from[i + term.length]; j++) marked[j] = true;
      }
    }
    let start = 0;
    for (let i = 1; i <= text.length; i++) {
      if (i < text.length && marked[i] === marked[start]) continue;
      const piece = text.slice(start, i);
      node.append(marked[start] ? Quizy.el('mark', '', piece) : document.createTextNode(piece));
      start = i;
    }
  }

  // One formula. Without KaTeX (it failed to load) the LaTeX source is shown as code.
  Quizy.mathNode = function (tex, display) {
    const node = Quizy.el('span', display ? 'math-display' : 'math');
    if (typeof katex === 'undefined') {
      node.append(Quizy.el('code', 'math-raw', display ? `$$${tex}$$` : `$${tex}$`));
      return node;
    }
    katex.render(tex, node, {...Quizy.KATEX_OPTIONS, throwOnError: false, displayMode: display});
    return node;
  };

  // A new element whose text goes through richText (maths, no emphasis).
  Quizy.richEl = (tag, className, text) => {
    const node = Quizy.el(tag, className);
    Quizy.richText(node, text);
    return node;
  };

  // Fisher-Yates on a copy, using Quizy.random (src/core/random.js) or the given generator.
  Quizy.shuffle = function (items, random = Quizy.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
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
