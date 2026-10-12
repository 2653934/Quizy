# Quizy

A small, phone-friendly practice-quiz app for several subjects (DVE, NLP and DO). Pick a subject, then a quiz set (a lecture bank, a past paper, a practice quiz or a tutorial). Every new round shuffles the question order and the answer positions. After you answer, it shows the marks you got, a study note and any doubts about the official answer. Typed questions (short answers, numbers, written explanations) have a "Copy for Claude" button that copies a ready-to-paste marking prompt. It also tracks which questions need another look on that device.

On the setup screen you can pick several lectures at once (chips), practise one question style (for example only "Label the diagram"), pool every set of a subject ("Everything in NLP"), or **generate a mock test**: a 50-mark paper shaped like the real test, with a 30-mark quiz section and a 20-mark theory section, mixing questions the lecturer set (60–80% of the marks) with new ones. Each paper has a code; type it under "Replay paper code" with the same lectures to sit the identical paper again. The summary breaks the marks down by section and by seen/new, and lets you retry what you missed.

**Browse all questions** (under the start buttons) lists a subject's whole question bank with a search box (every word must match, ignoring case and accents; it also finds source numbers such as "Q5.4" or "Paper Q13") and filters for quiz set, lectures, question style and "Only ones I got wrong". Tap a question to see its answer (correct options, values with tolerances, worked solution, model answer and rubric, study note), practise just that question, or copy it for Claude with a request to explain it. A question's answer view has its own link (`index.html#q=<question id>`).

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
```

- **New set:** create `data/<subject>/<name>.json` with `id`, `subject`, `title`, `kind` (`lecture-bank`, `past-paper`, `practice-quiz`, `tutorial` or `generated`), `description`, optional `totalMarks` / `negativeMarkingNote` / `unofficialAnswers`, and `questions`. Then add its id to that subject's `sets` in `data/subjects.json`. `data/nlp/past-quiz-2-2025.json` is a complete example.
- **Question types:** `single` (`choices`, `answer: [i]`), `truefalse` (`choices: ["True","False"]`), `multi` (`choices`, `answer: [i, …]`, optional `negativeMarking`) `match` (`pairs: [{prompt, answer}]`, `options`), `short` (`accept: ["…"]`, optional `caseSensitive`), `numeric` (`parts: [{label, answer, tolerance or relTolerance, marks, unit}]`, optional `grid`, `inputHint`, `solution`) `written` (`modelAnswer`, `rubric: [{point, marks}]`, self-marked) and `label` (`image` with the numbered boxes drawn in, `labels: [{number, answer}]`, `options`). Answer indices are zero-based. See `CLAUDE.md` for the full rules. Optional fields: `marks` (default 1), `explanation`, `keyDispute`, `emphasis`, `image: {src, alt}`, `source`, and for mock tests `section` (`quiz` / `theory`) and `variantOf` (a group id: at most one question per group in a paper). A set may give `origin` (`seen` / `new`) to override whether its kind counts as the lecturer's questions.
- **Maths:** in any text, `$…$` is an inline formula and `$$…$$` a displayed one (its own centred line), written in LaTeX that KaTeX supports; `\$` is a plain dollar sign. In JSON, double each backslash: `"Divide by $\\sqrt{d_k}$."`. Text without `$` looks exactly as before. The build stops on an unmatched `$` or a formula KaTeX can't read, and says which question and field.
- **Source papers are verbatim** (past papers, practice quizzes, tutorials): never edit their wording. If an answer looks wrong, add a `keyDispute` instead of changing `answer`.

Then run:

```sh
node tools/build-data.cjs        # validates every set and regenerates generated/quizy-data.js
node tools/check-verbatim.cjs    # past-paper, practice-quiz and tutorial text in the bundle is byte-identical to data/
node --test "tests/*.test.cjs"   # scoring, question-type, mock-paper, maths and search tests (Node's built-in runner, no installs)
```

The build checks unique ids, answer ranges, images, mark totals, the maths and each question type's own rules. Commit **both** the JSON and `generated/quizy-data.js`. The generated JavaScript lets the page work when opened directly from a local file; GitHub Pages reads the JSON.

Do not put private information in the question bank because a published site is public. Lecture PDFs are deliberately not included; use your course copies when checking a source.

## Code layout

Plain HTML, CSS and JavaScript (plus the vendored KaTeX) with no build step, so `index.html` also works from `file://`. The scripts are classic `<script defer>` files that share one `window.Quizy` namespace, loaded in order by `index.html`:

```
src/core/      helpers, maths ($…$ splitting, plain-text fallback), search, seeded random (?seed=N, for tests), storage, data loading, scoring, app state, the mock-paper generator
src/types/     one file per question type (single, truefalse, multi, match, short, numeric, written, label) + registry.js
src/ui/        theme, subject tabs, setup panel, quiz panel, "Copy for Claude", summary, mock papers, browse & search, view switching
src/main.js    boot
styles/        tokens, base, layout, components, question, paper, browse, types/<type>.css, views
vendor/katex/  KaTeX 0.19.0 (MIT), the only third-party code: maths rendering, also used by the build to check formulas
tools/         build-data.cjs, check-verbatim.cjs
tests/         node:test files (types, scoring, the paper generator, maths, search), fixture sets; smoke.md describes the browser checks
```

See `CLAUDE.md` for how to add a question type, a set or a subject.
