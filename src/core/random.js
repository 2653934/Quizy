'use strict';

// Quizy.random() is Math.random, unless the page URL has ?seed=N. The seed is only for tests:
// it makes the shuffles repeatable, so a browser check can replay exactly the same round.
(function (Quizy) {
  // mulberry32: a small, well-known seeded generator returning floats in [0, 1).
  function seeded(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let source = null;
  Quizy.random = function () {
    if (!source) {
      const match = /[?&]seed=(-?\d+)/.exec(globalThis.location?.search || '');
      source = match ? seeded(Number(match[1])) : Math.random;
    }
    return source();
  };
  // A separate seeded generator, e.g. for a mock paper's code (src/core/paper.js).
  Quizy.seeded = seeded;
  // For Node tests: Quizy.seedRandom(42) to replay, Quizy.seedRandom(null) to go back to Math.random.
  Quizy.seedRandom = seed => { source = seed === null ? Math.random : seeded(seed); };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
