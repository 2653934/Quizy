'use strict';

// Maths in data strings: $…$ is inline maths, $$…$$ display maths, \$ a literal dollar sign.
// Pure and Node-safe. Quizy.richText (src/core/util.js) draws the maths with KaTeX (vendor/katex/);
// tools/build-data.cjs uses checkMath to fail the build on unbalanced $ or a formula KaTeX can't parse.
(function (Quizy) {
  // Options for every KaTeX call (the browser adds throwOnError: false, the build throwOnError: true).
  Quizy.KATEX_OPTIONS = {strict: 'ignore'};

  // Index of the closing delimiter for maths starting at `from`, or -1. Backslash escapes are skipped.
  function closing(text, from, display) {
    for (let i = from; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] !== '$') continue;
      if (!display) return i;
      if (text[i + 1] === '$') return i;
    }
    return -1;
  }

  // Splits text into [{type: 'text' | 'inline' | 'display', value}]. In text parts \$ becomes $.
  // A $ that is never closed stays as literal text and the result gets unbalanced: true.
  Quizy.splitMath = function (text) {
    const s = String(text);
    const parts = [];
    let unbalanced = false;
    let buffer = '';
    for (let i = 0; i < s.length;) {
      if (s[i] === '\\' && s[i + 1] === '$') { buffer += '$'; i += 2; continue; }
      if (s[i] !== '$') { buffer += s[i++]; continue; }
      const display = s[i + 1] === '$';
      const width = display ? 2 : 1;
      const end = closing(s, i + width, display);
      if (end < 0) { unbalanced = true; buffer += s.slice(i, i + width); i += width; continue; }
      if (buffer) parts.push({type: 'text', value: buffer});
      buffer = '';
      parts.push({type: display ? 'display' : 'inline', value: s.slice(i + width, end)});
      i = end + width;
    }
    if (buffer) parts.push({type: 'text', value: buffer});
    parts.unbalanced = unbalanced;
    return parts;
  };

  Quizy.hasMath = text => typeof text === 'string' && text.includes('$');

  // Plain-text stand-ins for the simplest LaTeX (used in <select> options and for search).
  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
    upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };
  const SYMBOLS = {
    cdot: '·', times: '×', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
    to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', infty: '∞', in: '∈', sum: '∑', prod: '∏',
    ldots: '…', dots: '…', cdots: '⋯', partial: '∂', nabla: '∇', propto: '∝', sim: '∼', top: 'ᵀ',
    log: 'log', ln: 'ln', exp: 'exp', max: 'max', min: 'min', arg: 'arg', sin: 'sin', cos: 'cos', tanh: 'tanh'
  };
  const SUPER = {0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', T: 'ᵀ', 'ᵀ': 'ᵀ', n: 'ⁿ', i: 'ⁱ', k: 'ᵏ', t: 'ᵗ'};
  const SUB = {0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋',
    a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ'};
  const GROUP = '\\{([^{}]*)\\}';

  // ^{12} → ¹², _k → ₖ; when a character has no small form the LaTeX stays as it is.
  const script = map => (whole, braced, single) => {
    const chars = [...(braced ?? single)];
    return chars.every(c => map[c]) ? chars.map(c => map[c]).join('') : whole;
  };

  function latexToPlain(tex) {
    let s = tex
      .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|textbf|textit|operatorname|boldsymbol|mathbb|mathcal)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\left|\\right|\\displaystyle/g, '')
      .replace(/\\[,;:!]|\\q?quad|~/g, ' ');
    for (let i = 0; i < 4; i++) {
      s = s.replace(new RegExp(`\\\\[dt]?frac\\s*${GROUP}\\s*${GROUP}`, 'g'), (m, a, b) => `${wrap(a)}/${wrap(b)}`)
        .replace(new RegExp(`\\\\sqrt\\s*${GROUP}`, 'g'), (m, a) => `√${wrap(a)}`);
    }
    s = s.replace(/\\([a-zA-Z]+)/g, (m, name) => GREEK[name] ?? SYMBOLS[name] ?? m)
      .replace(new RegExp(`\\^(?:${GROUP}|([^\\s{\\\\]))`, 'g'), script(SUPER))
      .replace(new RegExp(`_(?:${GROUP}|([^\\s{\\\\]))`, 'g'), script(SUB))
      .replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002')   // escaped braces survive the brace removal below
      .replace(/[{}]/g, '')
      .replace(/\u0001/g, '{').replace(/\u0002/g, '}')
      .replace(/\\([%$_&#])/g, '$1');
    return s.replace(/\s+/g, ' ').trim();
  }
  // A fraction or root of more than one token gets brackets: \frac{a+b}{2} → (a+b)/2.
  const wrap = text => /^[^\s+\-*/=,<>]+$/.test(text.trim()) ? text.trim() : `(${text.trim()})`;

  // The text with its maths as plain text and the $ delimiters removed. Text without $ comes back unchanged.
  Quizy.mathToPlain = function (text) {
    if (!Quizy.hasMath(text)) return text;
    return Quizy.splitMath(text).map(part => part.type === 'text' ? part.value : latexToPlain(part.value)).join('');
  };

  // Problems with the maths in one string: unbalanced $, or a formula KaTeX can't parse.
  // katex is the KaTeX module (the build passes require('../vendor/katex/katex.min.js')).
  Quizy.checkMath = function (text, katex) {
    if (!Quizy.hasMath(text)) return [];
    const parts = Quizy.splitMath(text);
    const problems = parts.unbalanced ? ['unbalanced $ (write \\$ for a dollar sign)'] : [];
    for (const part of parts) {
      if (part.type === 'text') continue;
      if (!part.value.trim()) { problems.push('empty maths'); continue; }
      if (!katex) continue;
      try { katex.renderToString(part.value, {...Quizy.KATEX_OPTIONS, throwOnError: true, displayMode: part.type === 'display'}); }
      catch (error) { problems.push(`KaTeX can't read "${part.value}": ${error.message}`); }
    }
    return problems;
  };

  // Every text field of a question that the app shows, as [fieldName, text] (the build checks their maths).
  Quizy.shownFields = function (q) {
    const fields = [];
    const add = (name, value) => { if (typeof value === 'string') fields.push([name, value]); };
    const list = (name, values, f = x => x) => { if (Array.isArray(values)) values.forEach((v, i) => add(`${name}[${i}]`, f(v))); };
    add('question', q.question);
    list('choices', q.choices);
    list('pairs', q.pairs, p => p?.prompt);
    list('pairs.answer', q.pairs, p => p?.answer);
    list('options', q.options);
    list('labels.answer', q.labels, l => l?.answer);
    list('accept', q.accept);
    list('parts.label', q.parts, p => p?.label);
    list('parts.unit', q.parts, p => p?.unit);
    add('inputHint', q.inputHint);
    add('solution', q.solution);
    add('modelAnswer', q.modelAnswer);
    list('rubric', q.rubric, r => r?.point);
    add('explanation', q.explanation);
    add('keyDispute', q.keyDispute);
    add('optionsNote', q.optionsNote);
    return fields;
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
