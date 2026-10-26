'use strict';

// The single app state object, plus the small setters that change it. Node-safe.
// The ui/ files read Quizy.state directly; they change it only through these setters.
(function (Quizy) {
  const state = Quizy.state = {
    data: null,        // {subjects, sets: {id: set}} from Quizy.loadData()
    subject: null,     // the current subject from subjects.json
    sets: [],          // that subject's sets, in order
    setOf: new Map(),  // question id → the set it belongs to, for that subject
    attempts: {},      // that subject's progress: {[questionId]: {correct, score, at}}
    roundSet: null,    // the set being played (a stand-in for "Everything in …", a mock paper or a retry round)
    round: [],         // round items in play order: {q, set, choiceOrder, pairOrder, optionOrder, section (mock paper), score once answered}
    paper: null,       // during a mock paper: {code, lectures, sections: [{key, letter, name, marks, start, count}]}
    index: 0,          // position in round
    answered: false,   // whether round[index] has been answered
    rapidMode: false   // fully correct choice-based answers advance automatically
  };

  // loadAttempts(subjectKey) returns that subject's saved progress.
  Quizy.selectSubject = function (key, loadAttempts) {
    const {data} = state;
    state.subject = data.subjects.find(s => s.key === key) || data.subjects[0];
    state.sets = state.subject.sets.map(id => data.sets[id]).filter(Boolean);
    state.setOf = new Map(state.sets.flatMap(set => set.questions.map(q => [q.id, set])));
    state.attempts = loadAttempts(state.subject.key);
    return state.subject;
  };

  Quizy.allQuestions = () => state.sets.flatMap(s => s.questions);

  Quizy.beginRound = function (set, items, paper = null, options = {}) {
    state.roundSet = set;
    state.round = items;
    state.paper = paper;
    state.index = 0;
    state.answered = false;
    state.rapidMode = options.rapidMode === true;
  };

  // These types are multiple-choice interactions. Rapid mode deliberately excludes typed,
  // matching and labelling questions, even when they happen to receive full marks.
  Quizy.isRapidQuestion = q => ['single', 'truefalse', 'multi'].includes(q?.type);
  Quizy.shouldRapidAdvance = (q, score, enabled) => enabled === true && Quizy.isRapidQuestion(q) && Quizy.isFull(score, q);

  // A delayed transition belongs to one answered question in one round. Invalidate it on
  // navigation, and allow its advance step to be consumed only once.
  Quizy.createRapidAdvanceGate = function () {
    let generation = 0;
    return {
      cancel() { generation++; },
      begin(current) {
        const ticket = {generation: ++generation, round: current.round, index: current.index, used: false};
        return ticket;
      },
      isCurrent(ticket, current) {
        return ticket.generation === generation && ticket.round === current.round
          && ticket.index === current.index && current.answered && !ticket.used;
      },
      consume(ticket, current) {
        if (!this.isCurrent(ticket, current)) return false;
        ticket.used = true;
        return true;
      }
    };
  };

  // The comic burst shown on a rapid-mode correct answer: any word but the one shown last.
  // Decoration only, so it uses Math.random and never draws from a seeded round's generator.
  Quizy.CELEBRATIONS = ['BAM!', 'BOOM!', 'WOW!', 'AWESOME!', 'KAPOW!', 'NAILED IT!', 'ZING!', 'YES!'];
  Quizy.pickCelebration = function (previous, random = Math.random) {
    const words = Quizy.CELEBRATIONS.filter(word => word !== previous);
    return words[Math.min(words.length - 1, Math.floor(random() * words.length))];
  };

  // "Reset wrong answers": the subject's questions whose latest attempt was not fully correct
  // (the "Needs another look" count). Removing those attempts makes the questions unanswered again;
  // correct attempts, and attempts for questions no longer in the bank, are kept.
  Quizy.wrongQuestionIds = (questions, attempts) => questions.filter(q => attempts[q.id]?.correct === false).map(q => q.id);
  Quizy.resetWrong = function () {
    const ids = Quizy.wrongQuestionIds(Quizy.allQuestions(), state.attempts);
    for (const id of ids) delete state.attempts[id];
    return ids;
  };

  Quizy.currentItem = () => state.round[state.index];

  // During a mock paper, the section the current question is in; otherwise null.
  Quizy.currentSection = () => state.paper?.sections.find(s => state.index >= s.start && state.index < s.start + s.count) || null;

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
