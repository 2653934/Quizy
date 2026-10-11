'use strict';

// The single app state object, plus the small setters that change it. Node-safe.
// The ui/ files read Quizy.state directly; they change it only through these setters.
(function (Quizy) {
  const state = Quizy.state = {
    data: null,        // {subjects, sets: {id: set}} from Quizy.loadData()
    subject: null,     // the current subject from subjects.json
    sets: [],          // that subject's sets, in order
    attempts: {},      // that subject's progress: {[questionId]: {correct, score, at}}
    roundSet: null,    // the set being played
    round: [],         // round items in play order: {q, choiceOrder, pairOrder, optionOrder, score once answered}
    index: 0,          // position in round
    answered: false    // whether round[index] has been answered
  };

  // loadAttempts(subjectKey) returns that subject's saved progress.
  Quizy.selectSubject = function (key, loadAttempts) {
    const {data} = state;
    state.subject = data.subjects.find(s => s.key === key) || data.subjects[0];
    state.sets = state.subject.sets.map(id => data.sets[id]).filter(Boolean);
    state.attempts = loadAttempts(state.subject.key);
    return state.subject;
  };

  Quizy.allQuestions = () => state.sets.flatMap(s => s.questions);

  Quizy.beginRound = function (set, items) {
    state.roundSet = set;
    state.round = items;
    state.index = 0;
    state.answered = false;
  };

  Quizy.currentItem = () => state.round[state.index];

  // Stores the score on the round item and the latest attempt for the question.
  Quizy.recordAnswer = function (score) {
    const item = Quizy.currentItem();
    item.score = score;
    state.answered = true;
    state.attempts[item.q.id] = {correct: Quizy.isFull(score, item.q), score, at: new Date().toISOString()};
  };

  // Moves on; returns false when the round is over.
  Quizy.nextItem = function () {
    state.index++;
    state.answered = false;
    return state.index < state.round.length;
  };

  if (typeof module !== 'undefined') module.exports = Quizy;
})(globalThis.Quizy = globalThis.Quizy || {});
