'use strict';

// Loading the question data. Node-safe: tools/build-data.cjs uses Quizy.setFile too.
(function (Quizy) {
  // A set with id "<subject>-<name>" lives in data/<subject>/<name>.json (tools/build-data.cjs uses the same rule).
  Quizy.setFile = (subject, id) => `data/${subject}/${id.slice(subject.length + 1)}.json`;

  async function getJSON(url) {
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) throw new Error(`${url} unavailable`);
    return response.json();
  }

  // Over HTTP (GitHub Pages) read the JSON under data/. On file://, or if any fetch fails,
  // fall back to generated/quizy-data.js, which sets window.QUIZY_DATA.
  Quizy.loadData = async function () {
    if (location.protocol !== 'file:') {
      try {
        const registry = await getJSON('data/subjects.json');
        const sets = {};
        await Promise.all(registry.subjects.flatMap(s => s.sets.map(async id => { sets[id] = await getJSON(Quizy.setFile(s.key, id)); })));
        return {subjects: registry.subjects, sets};
      } catch (error) {
        console.warn('Using the bundled question data.', error);
      }
    }
    return globalThis.QUIZY_DATA;
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
