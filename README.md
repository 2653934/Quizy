# Quizy

A small, phone-friendly practice-quiz app for several subjects (DVE, NLP and DO). Pick a subject, then a quiz set (a lecture bank, a past paper, a practice quiz or a tutorial). Every new round shuffles the question order and the answer positions. After you answer, it shows the marks you got, a study note and any doubts about the official answer. Optional rapid mode automatically advances after a fully correct multiple-choice, True / False or Select all answer; wrong and partial answers stay put for review. A correct rapid answer also gets a quick comic “BAM!”-style burst. Typed questions (short answers, numbers, written explanations) have a "Copy for Claude" button that copies a ready-to-paste marking prompt. It also tracks which questions need another look on that device, and “Reset wrong answers” (after a confirmation) clears those so they count as unanswered again.

On the setup screen you can pick several lectures at once (chips), practise one question style (for example only "Label the diagram"), pool every set of a subject ("Everything in NLP"), or **generate a mock test**: a 50-mark paper shaped like the real test, with a 30-mark quiz section and a 20-mark theory section, mixing questions the lecturer set (60–80% of the marks) with new ones. Each paper has a code; type it under "Replay paper code" with the same lectures to sit the identical paper again. The summary breaks the marks down by section and by seen/new, and lets you retry what you missed.

DO has its own **scope exam** instead: “Generate a scope exam” builds a 50-mark paper shaped like the real DO exam (Question 1: 18 marks, Question 2: 20, Question 3: 12) from every topic in the 2026 final scope, 60–80% from the lecturer’s past questions (repeated ones more likely) and the rest from the new scope practice bank. “Full scope sweep” asks one question from every topic. Both have replayable codes (“4821”, “S4821”) and a summary with marks per exam question and per topic. DO chips show topic names instead of lecture numbers, and some answers come with a worked diagram.

**Browse all questions** (under the start buttons) lists a subject's whole question bank with a search box (every word must match, ignoring case and accents; it also finds source numbers such as "Q5.4" or "Paper Q13") and filters for quiz set, lectures, question style and "Only ones I got wrong". Tap a question to see its answer (correct options, values with tolerances, worked solution, model answer and rubric, study note), practise just that question, or copy it for Claude with a request to explain it. A question's answer view has its own link (`index.html#q=<question id>`).

DO and NLP also have a **Model sheet** (“Model sheet →” beside “Browse all questions”): one card for every model and algorithm in the exam scope (NLP: also the calculations and quiz traps of lectures 1–10, and a card for the Test 2 GPT-2 question at `index.html#ref=nlp-gpt2-mcq`), with the variables, objective and each constraint explained in plain words (or the numbered steps), key points, a diagram, an example and the page in the course notes or slides it comes from. Topic chips at the top jump to a topic, every card folds open and shut (“Collapse all / Expand all”), a search box filters the cards, and “Practise these questions” opens Browse on that topic. A card has its own link (`index.html#ref=<card id>`).

Formulas are typeset with [KaTeX](https://katex.org), which is included in `vendor/katex/` so it works offline and from a local file.

## Open it

- On a computer, double-click `index.html`.
- On a phone, publish this repository with GitHub Pages (Settings → Pages → Deploy from a branch → main / root), then open the Pages URL. A GitHub repository link alone shows code, not the quiz website.

The app is static: no account, backend or package installation. Progress is stored in the current browser only, with one record per subject.

## Add questions

All quiz content lives in `data/`:

```
data/subjects.json             # subjects, theme colours, and the set ids for each subject
data/<subject>/<name>.json     # one quiz set; its id must be "<subject>-<name>"
data/<subject>/img/...         # images referenced by questions (image.src is relative to index.html)
data/<subject>/reference.json  # optional model sheet ("reference": "<subject>-reference" in subjects.json)
```

- **New set:** create `data/<subject>/<name>.json` with `id`, `subject`, `title`, `kind` (`lecture-bank`, `past-paper`, `practice-quiz`, `tutorial` or `generated`), `description`, optional `totalMarks` / `negativeMarkingNote` / `unofficialAnswers`, and `questions`. Then add its id to that subject's `sets` in `data/subjects.json`. `data/nlp/past-quiz-2-2025.json` is a complete example.
- **Question types:** `single` (`choices`, `answer: [i]`), `truefalse` (`choices: ["True","False"]`), `multi` (`choices`, `answer: [i, …]`, optional `negativeMarking`) `match` (`pairs: [{prompt, answer}]`, `options`), `short` (`accept: ["…"]`, optional `caseSensitive`), `numeric` (`parts: [{label, answer, tolerance or relTolerance, marks, unit}]`, optional `grid`, `inputHint`, `solution`) `written` (`modelAnswer`, `rubric: [{point, marks}]`, self-marked) and `label` (`image` with the numbered boxes drawn in, `labels: [{number, answer}]`, `options`). Answer indices are zero-based. See `CLAUDE.md` for the full rules. Optional fields: `marks` (default 1), `explanation`, `keyDispute`, `emphasis`, `image: {src, alt}`, `source`, and for mock tests `section` (`quiz` / `theory`) and `variantOf` (a group id: at most one question per group in a paper). A set may give `origin` (`seen` / `new`) to override whether its kind counts as the lecturer's questions.
- **Maths:** in any text, `$…$` is an inline formula and `$$…$$` a displayed one (its own centred line), written in LaTeX that KaTeX supports; `\$` is a plain dollar sign. In JSON, double each backslash: `"Divide by $\\sqrt{d_k}$."`. Text without `$` looks exactly as before. The build stops on an unmatched `$` or a formula KaTeX can't read, and says which question and field.
- **Source papers are verbatim** (past papers, practice quizzes, tutorials): never edit their wording. If an answer looks wrong, add a `keyDispute` instead of changing `answer`.

Then run:

```sh
node tools/build-data.cjs        # validates every set and regenerates generated/quizy-data.js
node tools/check-verbatim.cjs    # past-paper, practice-quiz and tutorial text in the bundle is byte-identical to data/
node --test "tests/*.test.cjs"   # scoring, question-type, mock-paper, scope-exam, maths, search and model-sheet tests (Node's built-in runner, no installs)
```

The build checks unique ids, answer ranges, images, mark totals, the maths and each question type's own rules. Commit **both** the JSON and `generated/quizy-data.js`. The generated JavaScript lets the page work when opened directly from a local file; GitHub Pages reads the JSON.

Do not put private information in the question bank because a published site is public. Lecture PDFs are deliberately not included; use your course copies when checking a source.

## Code layout

Plain HTML, CSS and JavaScript (plus the vendored KaTeX) with no build step, so `index.html` also works from `file://`. The scripts are classic `<script defer>` files that share one `window.Quizy` namespace, loaded in order by `index.html`:

```
src/core/      helpers, maths ($…$ splitting, plain-text fallback), search, seeded random (?seed=N, for tests), storage, data loading, scoring, app state, the mock-paper and scope-exam generators, model-sheet checks and search
src/types/     one file per question type (single, truefalse, multi, match, short, numeric, written, label) + registry.js
src/ui/        theme and colour mode, sidebar and subject list, setup panel, quiz panel, "Copy for Claude", summary, mock papers, browse & search, the model sheet, view switching
src/main.js    boot
styles/        tokens, base, layout, components, question, paper, browse, reference, types/<type>.css, views
vendor/katex/  KaTeX 0.19.0 (MIT), the only third-party code: maths rendering, also used by the build to check formulas
tools/         build-data.cjs, check-verbatim.cjs
tests/         node:test files (types, scoring, the paper generator, maths, search, the model sheet), fixture sets; smoke.md describes the browser checks
```

See `CLAUDE.md` for how to add a question type, a set or a subject.
