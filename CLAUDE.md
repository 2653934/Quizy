# CLAUDE.md: Quizy

## What this is
Quizy is a small, static, phone-first practice-quiz site (plain HTML/CSS/JS, no framework, no build step apart from one Node script that bundles the data). The owner is a Wits CS student who practises on their phone through GitHub Pages (`origin` = github.com/2653934/Quizy).

It is a multi-subject app. Each subject has its own theme and a list of quiz sets:

| key | Subject | Sets |
|---|---|---|
| `dve` | COMS4060A Data Visualisation & Exploration | `dve-lecture-bank` (421 questions, lectures 1–6) |
| `nlp` | COMS4054A Natural Language Processing | `nlp-past-quiz-2-2025` (25 questions / 50 marks), `nlp-practice-quiz`, `nlp-tutorial`, `nlp-new-questions` (new exam-style questions) and `nlp-label-diagrams` (`label` questions, images in `data/nlp/img/labels/`); the last two are kind `generated` and written by the content author (Claude in the owner's Cowork chat), who also maintains the LaTeX in `data/nlp/` |
| `do`  | COMS4050A Discrete Optimisation (the owner calls it "DO") | none yet, so the app shows a "No quizzes yet" state |

There is no in-app editing, no accounts and no backend. Content is changed by editing JSON under `data/` and rebuilding.

## Mock papers ("Generate a mock test")
The setup screen's second way to start. `Quizy.makePaper` (`src/core/paper.js`, Node-safe, tested in `tests/paper.test.cjs`) builds a paper from **every set of the subject** for the chosen lecture chips (quiz set, style and mode don't apply); `ui.startPaper` (`src/ui/quiz.js`) plays it and `src/ui/paper.js` handles the buttons, the interlude and the summary.
- **Shape:** Section A · Quiz, exactly 30 marks, then Section B · Theory, exactly 20 marks (`Quizy.PAPER_SECTIONS`). Section by type: `written`, `numeric` → theory, everything else → quiz; a question's `"section"` overrides.
- **Seen vs new** (`Quizy.originOf(set)`): kinds `past-paper`, `practice-quiz`, `tutorial` are seen, `generated` and `lecture-bank` new; a set's `"origin"` overrides. Each paper draws a seen share f uniformly from [0.60, 0.80] and aims for `round(f × marks)` seen marks per section.
- **Exact totals:** marks are worked in hundredths, divided by the gcd of the marks involved. For each section a subset-sum table over the seen questions and one over the new questions give every reachable (seen, new) split that adds up exactly; the split nearest the seen target inside 60–80% wins, otherwise the one nearest the band (e.g. NLP L5 alone has too few seen marks). The subsets are then drawn at random from the tables. So an exact fill is always found when one exists, without a retry loop for the sums. Fresh shuffles (up to 200) are only used when `variantOf` groups exist, to rotate which question represents each group. If a section can't be filled, `makePaper` returns `{ok: false, section, available}` and the setup screen says e.g. "Not enough quiz questions in L1 only: pick more lectures." (DVE has no theory questions yet, so it says so.)
- **No near-duplicates:** at most one question per `variantOf` group, and never the same id twice.
- **Paper code:** `Quizy.newPaperCode()` (1000–9999, from `Quizy.random`, so `?seed` makes it repeatable) seeds `Quizy.seeded(code)` (mulberry32 from `src/core/random.js`). The same generator then shuffles the section order and each question's options, so "Replay paper code" with the same subject, lectures and data gives the identical paper. Changing the data (new questions in those lectures) changes what a code produces.
- **During the paper:** a bar above the question ("Paper 4821 · Section A · Quiz (30 marks)"); position and progress count within the section; the last question of Section A says "Finish Section A ↗", then the `#interlude` panel ("Section A done: 21.5 / 30.", "On to theory →", "End round"), which uses `body[data-view=quiz]`. Everything else is a normal round (feedback, Copy for Claude, progress saved per question). Every question shows its marks.
- **Summary:** total and percentage, a table of section marks, "Seen questions: a / b marks · New questions: c / d marks", then the questions not fully correct (tap one to redo just it) and "Retry the ones I missed", which start normal rounds.

## Browse & search ("Browse all questions")
The setup screen's third way in: a quiet "Browse all questions →" button under the start row opens the `#browse` panel (`src/ui/browse.js`, `styles/browse.css`). It only opens from the setup screen, so a round or mock paper in progress is never touched; the sidebar's subject list stays enabled (switching shows the new subject's bank, filters reset).
- **Filters:** search (debounced 150 ms), Quiz set ("All sets" or one), Lecture chips (the same component as setup, `ui.fillChips`; they start from the setup chips and are then kept in memory for the subject, not stored), Question style (`ui.fillStyles`, the same list as setup) and "Only ones I got wrong". A count line: "12 of 171 questions".
- **Search** (`src/core/search.js`, Node-safe, tested in `tests/search.test.cjs`): every term must appear (AND), ignoring case and accents (`Quizy.fold`), in the question, choices, pair prompts and answers, options, label answers, accepted answers, numeric part labels, solution, explanation, model answer, rubric points, concept and the source label (`Quizy.sourceLabel`: "Paper Q13", "Tutorial Q5.4", "Practice quiz Q1.2", "Slide 9"; "Q5.4" and "5.4" match too). LaTeX is matched as `Quizy.mathToPlain` text. Matches are marked in the card's question text (never inside maths).
- **List:** one card per question, in set order then question order: a style tag, "L7 · Self-attention calculation · Tutorial Q5.4 · 10 marks", the first two lines of the question (maths rendered) and the last result ("✓ Correct / ◐ Partly right / ✗ Wrong last time"). Cards are drawn 40 at a time ("Show 40 more (132 left)").
- **Answer view** (`#answer` panel, `body[data-view=browse]` like the list): the question (with its image), then the type's `answerKey(q)` (correct options marked, pairs / labels / numeric parts as "left → right" rows with tolerances, accepted answers, worked solution, model answer and rubric), then the study note and `keyDispute` (`ui.studyNotes`, shared with the quiz feedback; "Study note (unofficial answer)" for `unofficialAnswers` sets). "Practise this question ↗" starts a normal one-question round (`ui.returnTo = 'browse'`: its summary shows "Back to browse ↗" instead of "Choose another round", and "End round" also goes back); "Copy for Claude" copies `Quizy.explainPrompt` (question, the type's `reference(q)`, study note, asks for an explanation; LaTeX kept as `$…$`). "← Back to the list" (and "Back to browse") restores the filters, the number of cards drawn and the scroll position.
- **Deep link:** while a question is open the URL is `#q=<question id>` (`history.replaceState`, no history entries). Opening such a link (or changing the hash) opens that question's answer, switching subject if needed; it is ignored during a round.

## Architecture
The app must work when `index.html` is double-clicked (`file://`), and browsers block `<script type="module">` and `fetch` there. So there are **no ES modules**: every file is a **classic script** loaded in order with `defer` by `index.html`, and they all share one namespace, `window.Quizy`. Each file is an IIFE that adds to it:
- Browser-only files (`src/ui/`, `src/main.js`): `(function (Quizy) { … })(window.Quizy = window.Quizy || {});`
- Node-safe files (everything in `src/core/` and `src/types/`): `(function (Quizy) { … if (typeof module !== 'undefined') module.exports = Quizy; })(globalThis.Quizy = globalThis.Quizy || {});`. They never touch `document`/`window`/`localStorage` at load time (only inside functions), so `tools/build-data.cjs` and `tests/` can `require` them.
- **Exception to `defer`:** four small scripts load in `<head>` without `defer`, before the body is drawn: `src/core/storage.js`, `src/core/colors.js`, `src/ui/theme.js` and `src/ui/sidebar.js`. They set `html[data-mode]` (light/dark) and `html[data-sidebar]` (expanded/collapsed) from storage so there is no wrong-theme flash; at load time they only touch `document.documentElement`, and everything else is wired from `main.js` (`ui.wireColorMode()`, `ui.wireSidebar()`).
- No bundler, npm dependencies, frameworks or CDNs. The one exception is **KaTeX**, vendored in `vendor/katex/` (see its README there): `index.html` loads `katex.min.css` before `styles/tokens.css` and `katex.min.js` (a classic `defer` script, global `katex`) right after `generated/quizy-data.js`, and `tools/build-data.cjs` / `tests/` `require` the same UMD file.

```
index.html                  # markup only; loads styles/ and src/ in dependency order (keep the order)
favicon.svg
data/                       # content: subjects.json + one JSON file per set + images (see below)
generated/quizy-data.js     # GENERATED by tools/build-data.cjs: window.QUIZY_DATA = {subjects, sets: {id: set}}. Don't edit.
vendor/katex/               # KaTeX 0.19.0 (MIT): katex.min.js, katex.min.css, fonts/*.woff2, LICENSE, README.md. The only third-party code.
src/
  core/
    random.js               # Quizy.random(): Math.random, or seeded by ?seed=N in the URL (tests only); Quizy.seedRandom(n) in Node; Quizy.seeded(n) for paper codes
    util.js                 # $(), el(), richText() (maths + emphasis + search marks), richEl(), mathNode(), shuffle(items, random?), order(), plural(), formatMarks(), letter()
    math.js                 # maths in data strings: splitMath(), mathToPlain(), checkMath() (KaTeX parse check), shownFields(), KATEX_OPTIONS
    search.js               # browse search: fold(), searchTerms(), matchesSearch(), sourceLabel()
    scoring.js              # marksOf(), isFull(), roundTotals()
    storage.js              # Quizy.storage: localStorage in try/catch, attempts per subject, v1→v2 DVE migration, last subject, written drafts, lecture chips, colour mode, sidebar (loaded in <head>)
    colors.js               # themeTokens(theme, mode), themeColor(), resolveColorMode(), contrastRatio(): subject colours for light and dark (loaded in <head>)
    data.js                 # setFile() rule; loadData(): JSON over HTTP, else window.QUIZY_DATA
    state.js                # Quizy.state (data, subject, sets, setOf, attempts, roundSet, round, paper, index, answered) + setters, currentSection()
    prompt.js               # claudePrompt(): the "Copy for Claude" marking prompt; explainPrompt(): the browse view's "explain this" prompt (plain text, LaTeX kept)
    paper.js                # mock papers: makePaper(), originOf(), sectionOf(), lectureLabel(), newPaperCode(), checkPaperFields()
  types/                    # one file per question type, registered in Quizy.types
    registry.js             # registerType(); the contract (documented at the top); shared helpers (Quizy.typeHelpers)
    single.js  truefalse.js  multi.js  match.js
    short.js  numeric.js  written.js   # numeric.js also defines Quizy.parseNumber()
    label.js                # diagram labelling (wideFigure)
  ui/
    theme.js                # applyTheme(): CSS tokens for the colour mode, theme-color meta, favicon; the "Dark mode" button; follows the system until a choice is saved (loaded in <head>)
    sidebar.js              # collapse/expand the desktop sidebar (saved), the phone menu panel (menu button, Escape, closes after a choice) (loaded in <head>)
    views.js                # show(view, top?): panels, ui.view, body[data-view], scroll to top (or back to a saved position)
    subjects.js             # the sidebar subject list, chooseSubject() (subject text in sidebar/header)
    setup.js                # set select (+ "Everything in …"), lecture chips, style and mode selects, description, count line, empty state, stats, "Start quiz"
    ask.js                  # "Copy for Claude" buttons (quiz and answer view): clipboard with an execCommand fallback, "Copied ✓"
    quiz.js                 # startRound(), startPaper(), draw a question, grade, feedback, "Check answer", reveal step, "Next" (all via the type)
    summary.js              # end-of-round screen
    paper.js                # "Generate a mock test" / "Replay paper code", the interlude between sections, the paper summary
    browse.js               # "Browse all questions": filters, search, card list, answer view, practise one question, #q= deep links
  main.js                   # boot: load data → migrate storage → build tabs → wire events → chooseSubject(last)
styles/                     # readable CSS, loaded in this order (later files may override earlier ones)
  tokens.css                # :root theme tokens + shared colours, light and :root[data-mode=dark] (DVE defaults for first paint)
  base.css                  # reset, typography, buttons, form rows, maths (.katex size, .math-display scroll box, .math-raw)
  layout.css                # shell, sidebar (subject list, course, colour mode, collapsed rail, phone top bar and menu), main, header/hero, stats, footer + their breakpoints
  components.css            # seal, panels, setup text, lecture chips, start row, empty state, progress, figure, hints, caution
  question.css              # shared question rules: source line, text, generic .choice + states, typed inputs, feedback, "Copy for Claude"
  paper.css                 # mock papers: setup note + replay row, section bar, summary table and redo list
  browse.css                # browse: setup button, filters, cards, answer view rows
  types/<type>.css          # rules only one type uses; same order as the type scripts (single, truefalse, multi, match, short, numeric, written, label)
  views.css                 # body[data-view] rules (hiding hero/stats during a round and while browsing, compact header)
tools/
  build-data.cjs            # validate data/ (maths included) and write generated/quizy-data.js; an optional folder argument builds another copy (tests)
  check-verbatim.cjs        # source-paper strings (past-paper, practice-quiz, tutorial) in the bundle are byte-identical to data/ (generated sets are not checked)
tests/
  load.cjs                  # loads the Node-safe src files for the tests
  fixture.cjs               # a tiny set using every typed type (short, numeric, numeric grid, written, label); only used by the tests
  scoring.test.cjs          # marks, Moodle multi formula, every type's score, parseNumber, tolerance edges, Claude prompt, round totals, state
  types.test.cjs            # each type's validate() accepts the real data + fixture and rejects broken examples; makeOrder rules
  prefs.test.cjs            # colour mode / sidebar storage, light tokens unchanged, dark contrast for every subject, tokens.css dark values
  paper.test.cjs            # the generator: exact totals, seen share (brute-force checked), no repeats, same code → same paper, field checks
  math.test.cjs             # maths splitter (inline/display/escaped/unbalanced), mathToPlain, checkMath, the build failing on a bad formula
  search.test.cjs           # search (terms, accents, LaTeX stripped, source numbers), every type's reference(), explainPrompt
  maths-check.json          # a set with maths in every field of every type, for the browser check (smoke.md: maths.cjs); never in data/
  smoke.md                  # the browser smoke check (Playwright from a scratch folder; the scripts are inside)
```
Each CSS file keeps the `@media` overrides for its own selectors, so an override always loads after the rule it overrides. If you move a rule between files, keep that true.

### The question-type contract
Every file in `src/types/` calls `Quizy.registerType(name, impl)` with this shape (full notes at the top of `src/types/registry.js`):
```js
Quizy.registerType('multi', {
  // pure, Node-safe (also used by tools/build-data.cjs and tests/)
  validate(q, set, fail) { … },          // type-specific checks; fail(message) per problem
  makeOrder(q, shuffle) { … },           // {choiceOrder, pairOrder, optionOrder}: arrays of original indices for one round item
  score(q, response) { … },              // marks earned (the Moodle formula lives in multi.js)
  askClaude(q, response) { … },          // optional: {answer, reference} text; enables "Copy for Claude"
  // browser only
  needsCheckButton: true,                // false: the type submits itself on tap (single, truefalse)
  checkLabel: 'Check answer',            // optional button text (written: "Reveal model answer")
  wideFigure: true,                      // optional: show the question's image at full panel width (label)
  hints(q, set) { … },                   // nodes shown above the inputs ([] for none)
  render(container, q, item, onReady, submit) { … }, // draw inputs; onReady(bool) enables "Check answer"; tap types call submit(response)
  readResponse(container, q, item) { … },            // check-button types: read the response from the DOM
  reveal(container, q, item, response, submit) { … }, // optional second step: replaces grading on the check button; call submit(final) later
  showResult(container, q, item, response) { … },   // disable inputs, mark correct/wrong/missed, add tags
  resultNotes(q, response) { … },        // optional: feedback nodes after the verdict, before the study note
  // the browse view (src/ui/browse.js)
  reference(q) { … },                    // the reference answer as plain text (LaTeX kept); askClaude reuses it where a type has one
  answerKey(q) { … }                     // nodes showing the answer without inputs (correct options, rows, model answer…)
});
```
Responses: `single`/`truefalse` `[pickedOriginalIndex]`; `multi` the ticked original indices; `match` an array indexed by original pair index holding the picked original option index (or `null`); `short` the typed string; `numeric` the typed string of each part, by part index (parsed by `score`); `written` `{text, ticked}` (ticked rubric indices); `label` an array indexed by original label index holding the picked original option index (or `null`).

The optional hooks were added for the typed types and the original four don't use them:
- **Two-step submit (`reveal`).** "Check answer" (labelled with `checkLabel`) reads the response and, if the type has `reveal`, hides itself and calls `reveal(…, submit)` instead of grading. The type then shows more (written: model answer + rubric checklist + "Submit my mark") and calls `submit(finalResponse)`; only then are `score`, `showResult`, the feedback and the saved attempt done.
- **"Copy for Claude" (`askClaude`).** When a type has it, `ui.showAsk` (`src/ui/ask.js`) shows the button after answering, or already after revealing. The prompt is built by `Quizy.claudePrompt` (`src/core/prompt.js`) from subject, set title, question, marks and the type's `{answer, reference}`, and asks Claude to mark against the reference, say what's missing and give one tip. No network calls.
- **`resultNotes`** adds type-specific feedback blocks (numeric: "Worked solution") before the study note. `src/ui/quiz.js` has no `q.type` branches; it only calls the registered type.

Every type has `reference` and `answerKey` (for the browse view; `src/ui/browse.js` has no `q.type` branches either). Every data text a type shows goes through `Quizy.richText` / `Quizy.richEl` so its maths renders; `<option>` text uses `Quizy.typeHelpers.option`, which applies `Quizy.mathToPlain`.

Each round item also carries `set`, the set its question comes from (`state.setOf`), because a round can mix sets ("Everything in …", a mock paper, a retry round). The marks shown, `negativeMarkingNote` hints, the unofficial study-note label and the Claude prompt all use the item's set; `state.roundSet` (a stand-in for mixed rounds) only decides how the normal summary counts. `tools/build-data.cjs` keeps the checks that span questions and sets and calls the type's `validate` for the rest; an unknown type fails the build.

### How to add a question type
1. Add `src/types/<name>.js` that registers the contract above (copy the closest existing type). Put its per-type validation in `validate`, and reuse `Quizy.typeHelpers` where it fits.
2. Add `<script src="src/types/<name>.js" defer></script>` to `index.html` after `registry.js` and before `src/ui/`.
3. Add `styles/types/<name>.css` for rules only this type uses, linked in `index.html` after the other `styles/types/` files (same order as the type scripts) and before `views.css`. Rules several types share go in `styles/question.css`.
4. Add validate/score cases to `tests/types.test.cjs` and `tests/scoring.test.cjs`, a `reference` case to `tests/search.test.cjs`, a question to `tests/maths-check.json`, and update the "registered types" test. `tools/build-data.cjs` and `tests/load.cjs` load every file in `src/types/` automatically.
5. Document the type in the Question schema table below.

### How to add a set
1. Create `data/<subject>/<name>.json` with id `<subject>-<name>` (see "Set file header" below).
2. Add the id to that subject's `sets` in `data/subjects.json`, in the order it should appear.
3. Run `node tools/build-data.cjs`, `node tools/check-verbatim.cjs` (for past papers, practice quizzes and tutorials) and the tests. Commit the JSON together with `generated/quizy-data.js`.

### How to add a subject
1. Add an entry to `data/subjects.json` (`key`, `code`, `name`, `theme` with four `#rrggbb` colours and checked contrast, `sets`), and create `data/<key>/` (a `.gitkeep` if it has no sets yet).
2. Rebuild. Tabs, theme, header text and the empty state all come from the data, so no code changes are needed.

## Hard rules
- **Source papers are verbatim** (kinds `past-paper`, `practice-quiz`, `tutorial`). Never reword, "fix" typos in, shorten or reformat the text of any question, choice, matching prompt, option or numeric part label in a set of those kinds. Typos such as "Bilnear", "capture by" and "called then classification token" are intentional transcriptions. The only things that may change are **the order of the questions and the order of the options**, randomised on every new round. Exception: where the original showed a typeset equation, it may be written as LaTeX (`$…$`) instead of Unicode; that is markup, not rewording (only the content author does this).
- **Don't change the given answers** (taken from the 'The correct answer is:' lines of the attempt review, not the student's picks). If an answer looks wrong, leave `answer` alone and add or keep a `keyDispute` string. The UI shows it after answering.
- Never `innerHTML` data text: it goes through `textContent` / `Quizy.richText`; only KaTeX writes markup for the maths.
- `explanation` fields are study notes, not part of the paper. They are shown after answering, visually separate from the question.
- Stay static: it must work both when `index.html` is opened from disk (`file://`, using the bundled `generated/quizy-data.js`) and on GitHub Pages (fetching the JSON). No CDNs, frameworks or npm dependencies, except the vendored KaTeX in `vendor/` (loaded from the repo, never a CDN, so maths works offline and from `file://`). Node is only used for the build script, tools and tests (built-in modules only, e.g. `node:test`).
- Phone first: test at about 375px wide. Tap targets should be at least 48px tall, with no horizontal scrolling and readable maths/images.
- Keep the existing look (Georgia headings, ink borders, offset shadows). Themes only change the colour tokens.
- Don't break existing progress (see Storage). Never change the id of a question that has been published.

## Data layout
```
data/
  subjects.json            # subject registry: key, code, name, theme, ordered set ids
  dve/lecture-bank.json
  nlp/past-quiz-2-2025.json
  nlp/img/q20-attention-map.png
  do/.gitkeep              # empty for now
```
**Set file rule:** a set with id `<subject>-<name>` lives at `data/<subject>/<name>.json` (e.g. `nlp-past-quiz-2-2025` → `data/nlp/past-quiz-2-2025.json`). `subjects.json` lists only ids; `Quizy.setFile` (`src/core/data.js`) derives the path with this rule for both the app and the build, and the build fails if the file, its `id` or its `subject` don't match.

### `data/subjects.json`
Each subject has `key`, `code`, `name`, `theme` and `sets` (ordered ids). `theme` holds four `#rrggbb` colours: `accent`, `paper`, `light`, `aside`. Keep white-on-accent text at ≥ 4.5:1 contrast and accent-on-paper text close to that (DO uses `#9a5c15` because the first suggestion, `#a8661b`, was too light). Current accents: DVE `#147d83`, NLP `#5b4bb7`, DO `#9a5c15`.

`src/ui/theme.js` (`applyTheme`) sets those four as CSS custom properties on `:root` and derives the rest by mixing colours: `--accent-dark` (hover), `--seal`, `--line`, `--track`, `--shadow`, `--field-line`, `--surface`, `--choice-bg`. It also updates `<meta name="theme-color">` and the favicon. `styles/tokens.css` holds DVE defaults for first paint. Don't hard-code theme colours in CSS; use the tokens. `--ink`, `--muted`, `--green`, `--bad` and `--warn` are shared by all themes.

**Dark mode.** `html[data-mode]` is `light` or `dark`: the saved choice (`quizy-color-mode-v1`, set by the sidebar's "Dark mode" button) or, without one, the system preference (followed live). The colour derivation lives in `src/core/colors.js` (`Quizy.themeTokens(theme, mode)`); light mode returns exactly the tokens above, so the light look is unchanged. Dark mode keeps each subject's `accent` as the fill colour (white text on buttons, chosen subject and chips) and mixes near-black surfaces with a hint of it (`--paper`, `--aside`, `--surface`, `--choice-bg`, `--field-bg`, `--light`, `--seal`, `--line`, `--track`, `--shadow`, `--field-line`), plus `--accent-text`, a lighter accent for accent-coloured text with ≥ 4.5:1 on every dark surface. Shared tokens that change only with the mode are in `styles/tokens.css`: `--ink`, `--muted`, `--edge` (ink borders and offset shadows), `--green`, `--bad`, `--warn`, `--field-bg`, the feedback backgrounds (`--good-bg`, `--bad-bg`, `--good-soft`, `--partial-soft`, `--bad-soft`, `--caution-bg`) and `--mark-bg` (search highlights). `color-scheme` follows the mode, and `<meta name="theme-color">` is the accent (light) or the dark side-panel colour (dark). Question images stay on white in both modes. `tests/prefs.test.cjs` checks the contrast of every subject in both modes and that the dark DVE first-paint values in `tokens.css` match `colors.js`.

### Set file header
`id`, `subject`, `title`, `kind` (`"lecture-bank"` | `"past-paper"` | `"practice-quiz"` | `"tutorial"` | `"generated"`), `description`, optional `totalMarks`, optional `negativeMarkingNote`, optional `unofficialAnswers` (boolean), optional `origin` (`"seen"` | `"new"`, overriding the kind's default for mock papers), and `questions`. Extra metadata such as `sourceFile` and `transcriptionNotes` is allowed and ignored by the UI. `data/nlp/past-quiz-2-2025.json` is a complete example.

`"unofficialAnswers": true` means the answers, rubrics and solutions were written by Claude, not the lecturer. The setup screen then shows "Answers on this set are unofficial" under the description, the study-note heading reads "Study note (unofficial answer)", and the Claude prompt says the reference may be wrong.

## Question schema
Common fields: `id` (globally unique), `lecture`, `concept`, `question` (may contain `\n`, rendered as line breaks), `type`, `marks` (default 1), `explanation`, optional `keyDispute`, optional `emphasis` (words shown in bold inside `question`, matched as whole words), optional `emphasisInChoices` (`{"<original choice index>": [words]}`), optional `image` `{src, alt}` (path relative to `index.html`), optional `optionsNote` (shown in small print under the study note), optional `section` (`"quiz"` | `"theory"`: the mock-paper section, overriding the type default), optional `variantOf` (a group id: questions testing the same fact share one, and a mock paper takes at most one per group), and optional `source`. DVE uses `source: {file, pages}` (required for `lecture-bank` sets); the NLP past paper uses `number`, the question's original number, shown as "Paper Q14" (the tutorial uses strings such as `"3.2"`).

**Maths in text:** in every string the app shows (`question`, `choices`, match `pairs[].prompt` and `options`, label `options`, numeric `parts[].label` / `unit`, `inputHint`, `solution`, `explanation`, `keyDispute`, `optionsNote`, `modelAnswer`, `rubric[].point`, short `accept`, and the set `description`), `$…$` is inline maths and `$$…$$` display maths (its own centred line; a single line break right next to it is dropped; if too wide, it scrolls sideways inside its own box). `\$` is a literal dollar sign (in JSON: `"\\$5"`). Everything outside the delimiters is plain text as before, and a string without `$` renders exactly as it always did. Inside the maths, write KaTeX-supported LaTeX (JSON strings double the backslashes: `"$\\sqrt{d_k}$"`). `Quizy.richText` draws it with `katex.render(…, {throwOnError: false})` and applies `emphasis` only outside the maths; if KaTeX failed to load, the LaTeX source shows in a `<code>`. `<select>` options can't hold markup, so match and label options show `Quizy.mathToPlain` text (`\sqrt{x}` → √x, `^T` → ᵀ, `_k` → ₖ, `\cdot` → ·, `\times` → ×, Greek letters, `\frac{a}{b}` → a/b, `\text{…}` → its text; anything else stays as LaTeX without braces). The "Copy for Claude" prompts keep the `$…$` source. The build fails on an unbalanced `$` or a formula KaTeX can't parse, naming the set, question and field.

| `type` | Fields | UI | Grading |
|---|---|---|---|
| `single` | `choices[]`, `answer: [i]` | Tap one option, which reveals the answer immediately | full marks or 0 |
| `truefalse` | `choices: ["True","False"]`, `answer: [i]` | Two buttons, **never shuffled** (True then False) | full marks or 0 |
| `multi` | `choices[]`, `answer: [i,…]`, `negativeMarking` | Checkboxes + "Check answer" (disabled until one is ticked). Shows "Select all that apply" and, if `negativeMarking`, the set's `negativeMarkingNote` | Moodle style (below) |
| `match` | `pairs: [{prompt, answer}]`, `options[]` | One `<select>` per prompt (prompts and options both shuffled) + "Check answer" (disabled until every row is filled) | `marks × (correct pairs / pairs)` |
| `short` | `accept: ["…"]` (non-empty strings), optional `caseSensitive` | One text input (no autocapitalise/autocomplete/spellcheck); "Check answer" once non-empty, Enter submits. Afterwards shows the accepted answer(s) | Trim, collapse inner whitespace, lower-case unless `caseSensitive`; full marks if it equals any normalised `accept` entry, else 0 |
| `numeric` | `parts: [{label, answer, tolerance \| relTolerance, marks, unit?}]`, optional `grid: {rows, cols}`, optional `inputHint`, `solution` | One `inputmode="decimal"` text input per part (label beside it, unit after it), or a rows × cols grid filled row by row (labels become `title`/`aria-label`). "Check answer" once every input is filled. Unreadable input gets "Couldn't read this number". Afterwards: each input right/wrong, expected value beside wrong ones, then a "Worked solution" block before the study note | Each part earns its `marks` if `\|x − answer\| ≤ tolerance` (or `≤ relTolerance × \|answer\|`), edge included; score = sum. Accepted input: `0.0083`, `.0083`, `-1.2`, `8.33e-3`/`E`, decimal comma `0,0083`, simple fraction `1/120` (`Quizy.parseNumber`); anything else counts as wrong |
| `label` | `image` (required), `labels: [{number, answer}]`, `options[]` | The diagram (numbered boxes already drawn into the image) at full panel width, edge to edge on phones, tap to open. One row per label **in number order**: the number + a `<select>` ("Choose…" then the options, shuffled once per round, the same list on every row; an option may be picked twice). "Check answer" once every row has a choice. Afterwards each row is right/wrong with "Answer: …" under wrong ones. No "Copy for Claude" | `marks × (correct labels / labels)` |
| `written` | `modelAnswer`, `rubric: [{point, marks}]` | Optional `<textarea>` (kept per question in storage and restored) + "Reveal model answer" (always enabled). Reveal: textarea read-only beside the model answer, the rubric as a checklist with marks, "Submit my mark". Feedback and the saved attempt come only after submitting | Self-marked: sum of the ticked points' marks |

Validation for the typed types: `short` needs `accept`; `numeric` needs parts, finite answers, exactly one positive tolerance field per part (`relTolerance` needs a non-zero answer), positive part marks adding up to the question's `marks`, a consistent `grid` (`rows × cols = parts.length`) and a non-empty `solution`; `written` needs a non-empty `modelAnswer` and rubric points with text and positive marks adding up to the question's `marks`. None of them shuffle (`makeOrder` returns empty orders). `label` needs an `image`, at least two text `options` without repeats, and non-empty `labels` with unique positive whole-number `number`s whose `answer` is in `options`. After answering (or revealing, for `written`) they show "Copy for Claude".

**Moodle-style multi-select score:** with C correct and W wrong options, `score = marks × max(0, picked_correct / C − picked_wrong / W)`. Picking every option scores 0; 1 correct + 1 wrong with C=1, W=3 scores 0.667; 1 of 2 correct scores 0.5. A question counts as "correct" for progress only at full marks; partial marks appear in the feedback (e.g. "2.67 / 4 marks").

Shuffling happens per round (`ui.startRound` calls each type's `makeOrder`): each round item stores `choiceOrder` / `pairOrder` / `optionOrder` as arrays of original indices, and grading always uses original indices. The question objects and their strings are never copied or modified, and options are re-lettered a., b., c. after shuffling.

After answering, options are marked correct, wrong-and-picked or missed-correct (dashed border, multi only), followed by the verdict and marks, any type-specific block (numeric's worked solution), the study note, and any `keyDispute` as a caution box. Typed types then show "Copy for Claude" ("Copied ✓" for 2 seconds; if both the Clipboard API and the `execCommand` fallback fail, the prompt appears in a read-only box to copy by hand).

## Rounds and summary
- **Sidebar** (`src/ui/sidebar.js`, `src/ui/subjects.js`, `styles/layout.css`): brand and collapse button, "Subjects" (one button per subject from `subjects.json`: key badge, name, course code; the chosen one is `aria-pressed=true`; disabled during a round), "Now studying" (code, name, number of sets), then the "Dark mode" toggle (`aria-pressed`) and the storage note at the bottom. On desktop the collapse button (`aria-expanded`, label "Collapse sidebar" / "Expand sidebar") turns it into an 84px rail (logo, subject badges with the full name as tooltip and accessible name, the mode button), saved in `quizy-sidebar-v1`. At ≤ 700px there is no rail: a compact top bar (brand, current subject, "Menu" button with `aria-expanded`) opens the same content as a panel underneath; it closes after choosing a subject, on Escape (focus back on the menu button) and when a view changes.
- Setup: **Quiz set** (subjects with several sets get "Everything in NLP" at the top, pooling every set; the first real set stays the default), the set's `description`, **Lecture** chips ("All", then every lecture in the subject; several can be on; lectures with nothing in the chosen set are dashed; remembered per subject), **Question style** (only the styles present in the chosen set and lectures: Multiple choice, True / False, Select all that apply, Matching, Short answer, Calculation, Written / theory, Label the diagram), **Questions** (all / only ones I got wrong), a live count line, "Start quiz ↗" with "Generate a mock test ↗" beside it, "Browse all questions →" under them (see Browse & search), and "Replay paper code" (see Mock papers). Past-paper, practice-quiz and tutorial sets show "N questions · M marks · order randomised"; sets with `unofficialAnswers` show the unofficial note under the description.
- Stats and the seal count questions across the whole current subject.
- During a round, `show()` (`src/ui/views.js`) sets `<body data-view="quiz">` and `styles/views.css` hides the hero and the stats row and compacts the header: the sidebar's subject list is disabled (the colour mode still works), and on phones the top bar (keeping its 48px menu button) and top margins shrink. Both come back on the setup and summary screens (`data-view="setup"` / `"summary"`). While browsing (the list and the answer view) it is `data-view="browse"`: hero and stats hidden, the subject list enabled.
- Scrolling: switching views scrolls smoothly to the top of the page. "Next question" smoothly scrolls the quiz panel into view (`scrollIntoView`, `scroll-margin-top: 12px`), so the progress bar, "End round" and the question are on screen. At 375×667 the question text must start within the first screen on every question (last measured 2026-10-26, after the sidebar moved the subject list out of the main column: at most 272px from the top, on question 1; later questions start nearer the top).
- Summary: sets with `totalMarks` show "31.5 / 50 marks" plus "X of N questions fully correct"; other sets show "X out of N correct". A round started with "Practise this question" in the browse view shows "Back to browse ↗" instead of "Choose another round ↗".
- Going back to the browse list (`ui.show('browse', top)`) restores its scroll position instantly instead of scrolling to the top.

## Storage
- `localStorage` only, every access wrapped in try/catch (`src/core/storage.js`). Progress key per subject: `quizy-attempts-v2-<subject>` holding `{[questionId]: {correct, score, at}}`.
- Migration: on load, if `quizy-attempts-v2-dve` is missing and `quizy-dve-attempts-v1` exists, the old value is copied over (the old key is kept). Old entries have no `score`, which is fine.
- Last subject: `quizy-last-subject`.
- Colour mode: `quizy-color-mode-v1` (`"light"` / `"dark"`; missing or anything else means follow the system). Sidebar: `quizy-sidebar-v1` (`"collapsed"` / `"expanded"`).
- Written drafts: `quizy-written-v1-<subject>` holding `{[questionId]: text}`, saved as you type and restored when the question reappears (empty text removes the entry).
- Lecture chips: `quizy-lectures-v1-<subject>` holding the chosen lectures as strings (`["5","6"]`, `[]` for all); lectures no longer in the subject are dropped when read.

## `tools/build-data.cjs`
Reads `data/subjects.json` and every set it references (`node tools/build-data.cjs <folder>` does the same for another folder with that layout; the tests use it). It loads the Node-safe `util.js`, `math.js`, `scoring.js`, `data.js` and `paper.js`, every type and the vendored `katex.min.js`. It validates subject keys and theme colours, the set file rule, `kind`, `unofficialAnswers` being a boolean, unique question ids across all sets, that `type` is registered, `image.src` files existing, `emphasis` words appearing in the text, `source` on lecture-bank questions, `totalMarks` matching the sum of marks, and the mock-paper fields (`Quizy.checkPaperFields`: set `origin` ∈ {seen, new}, question `section` ∈ {quiz, theory}, `variantOf` a non-empty string). Each type's `validate` adds its own checks: answer indices in range (exactly one for `single`/`truefalse`, ≥ 1 for `multi`), `truefalse` choices exactly `["True","False"]`, `match` answers present in `options`, `emphasisInChoices`, and the `short` / `numeric` / `written` rules in the Question schema. Then the maths: for every shown field (`Quizy.shownFields`) and the set description, `Quizy.checkMath` fails on an unbalanced `$` (an escaped `\$` doesn't count) and renders each formula once with `throwOnError: true`, so a KaTeX parse error fails the build with the set, question id and field. It then writes `generated/quizy-data.js` and prints counts per subject. The app (`Quizy.loadData`) fetches `data/subjects.json` and the set files over HTTP and falls back to `window.QUIZY_DATA` on `file://` or when any fetch fails.

**Run `node tools/build-data.cjs` after every data change, and commit the JSON together with the generated JS.**

## Verifying changes
Sidebar and dark mode (2026-10-26, `feature/sidebar-theme`): the seeded smoke run matched the `main` baseline in every round, score, option and feedback HTML, stat, theme token, theme colour and favicon; only the setup text (no subject switcher in the main column), the sidebar text and the question tops (now at most 272px) changed, and every screenshot differs because of the sidebar. `sidebar.cjs`, `newtypes.cjs`, `paper.cjs` and `maths.cjs` passed (the last two only after updating out-of-date data expectations in scratch copies: DVE now has 1123 questions in two sets, and `paper.cjs` / `maths.cjs` still expect `dve-lecture-bank` alone and "421 of 421 questions"; those fail on `main` too).

Last full verification before that: 2026-10-12 (after adding maths rendering and Browse & search, on `feature/math-browse`), all passing. The seeded smoke run matched the `main` baseline except the setup screen, which was re-baselined: its text gained only the "Browse all questions →" line and 56/64 screenshots are byte-identical (the 8 that differ are the full-page setup screenshots); every round, score, stat and question-top measurement (at most 301px) is unchanged. `newtypes.cjs`, `paper.cjs` and `maths.cjs` (in a scratch copy with `tests/maths-check.json` registered) passed.
1. `node tools/build-data.cjs` passes, with the expected counts (DVE 421; NLP 5 sets, 171 questions, 450 marks at the last check, growing as the content author adds questions; DO 0).
2. `node tools/check-verbatim.cjs` passes: every `question`, `choices`, `pairs`, `options` and `parts[].label` string of the past-paper, practice-quiz and tutorial sets in the bundle is byte-identical to the source JSON.
3. `node --test "tests/*.test.cjs"` passes. (On Node 24, `node --test tests/` does not work: a directory argument is treated as a module path. The quoted glob works the same in PowerShell and bash.)
4. Browser check, see `tests/smoke.md` (Playwright installed in a scratch folder, not the repo; `playwright-core` with `channel: 'msedge'` works on this machine): `file://` and a local HTTP server, at 375px and at desktop width. Switch subjects, play a round covering every type, and confirm that old progress still counts, nothing scrolls sideways, tap targets are ≥ 48px, and there are no console errors. At 375×667, after each question's scroll has settled, the question text, progress bar and "End round" must be on screen. (When waiting for smooth scrolling to finish, don't return a Promise from `page.waitForFunction`: it counts as truthy straight away. Poll `scrollY` inside `page.evaluate` instead.) The smoke scripts replay seeded rounds (`?seed=7`) and compare text, scores and screenshots with a baseline, so run them before and after a change. `newtypes.cjs` (also in `tests/smoke.md`) plays one `short`, `numeric` (single, multi-part and grid) and `written` question end to end, including restoring a written draft after a reload, the clipboard button and its fallback, and the unofficial labels. `paper.cjs` generates NLP L5–L8 papers, plays one through both sections, the interlude, the summary, retry and redo, replays the code, practises Label the diagram only, and checks the chips, "Everything in NLP" and the not-enough messages. `maths.cjs` plays the maths fixture set (every type, maths in every field) offline and checks KaTeX output, the fonts from `vendor/`, the plain-text `<select>` options and the wide-formula scroll box, then the whole browse flow (search, filters, answer view, practise, back with filters intact, show more, subject switch, deep link, Copy for Claude) and the raw-LaTeX fallback.

## Roadmap
1. (Done, merged) `short` / `numeric` / `written` types, "Copy for Claude", NLP practice quiz and tutorial sets.
2. (Done on `feature/paper-generator`, not merged) mock-paper generator, `label` type, practise by style; the new NLP questions and labelling diagrams are written separately by the content author.
3. (Done on `feature/math-browse`, not merged) maths rendering with vendored KaTeX, and Browse & search; the LaTeX in `data/nlp/` is written separately by the content author.
4. The same for DVE and DO.

## Out of scope for now (don't build yet)
- Built-in AI marking (needs an API key, which can't be kept secret on a static public site). "Copy for Claude" covers this for now.
- In-app editing, accounts, sync, analytics.

## Open questions
- None at the moment. (DO's full name, Discrete Optimisation, was confirmed on 2026-10-26.)

## Note on publishing
GitHub Pages sites are public. University past-paper questions in a public repo may be against course rules. Mention this to the owner before pushing and don't push unless asked.
