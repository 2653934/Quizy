'use strict';

// Search for the browse view (src/ui/browse.js). Pure and Node-safe.
// Every term must appear (AND), ignoring case and accents, in the question's text fields with
// their LaTeX turned into plain text (Quizy.mathToPlain), its concept or its source number.
(function (Quizy) {
  // Lower case without accents: "Señal" → "senal". Used for both the text and the terms.
  Quizy.fold = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Where the question comes from, as shown in the browse list: "Paper Q13", "Tutorial Q5.4", "Slide 9".
  const PREFIX = {'past-paper': 'Paper Q', 'practice-quiz': 'Practice quiz Q', tutorial: 'Tutorial Q'};
  Quizy.sourceLabel = function (q, set) {
    if (q.number !== undefined) return `${PREFIX[set?.kind] || 'Q'}${q.number}`;
    if (q.source?.pages?.length) return `Slide ${q.source.pages[0]}`;
    return '';
  };

  Quizy.searchTerms = query => Quizy.fold(query).split(/\s+/).filter(Boolean);

  // The searchable text of a question, folded, built once per question.
  const cache = new WeakMap();
  function haystack(q, set) {
    if (cache.has(q)) return cache.get(q);
    const texts = [q.question, q.concept, Quizy.sourceLabel(q, set), q.number !== undefined ? `Q${q.number}` : '',
      ...(q.choices || []), ...(q.pairs || []).flatMap(p => [p.prompt, p.answer]), ...(q.options || []),
      ...(q.labels || []).map(l => l.answer), ...(q.accept || []), ...(q.parts || []).map(p => p.label),
      q.solution, q.explanation, q.modelAnswer, ...(q.rubric || []).map(r => r.point)];
    const text = Quizy.fold(texts.filter(t => typeof t === 'string' && t).map(Quizy.mathToPlain).join('\n'));
    cache.set(q, text);
    return text;
  }

  // terms from Quizy.searchTerms; no terms matches everything.
  Quizy.matchesSearch = (q, set, terms) => !terms.length || terms.every(term => haystack(q, set).includes(term));

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
