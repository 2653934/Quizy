# Quizy

A small, phone-friendly practice-quiz app for several subjects (DVE, NLP and DO). Pick a subject, then a quiz set (a lecture bank, a past paper, a practice quiz or a tutorial). Every new round shuffles the question order and the answer positions. After you answer, it shows the marks you got, a study note and any doubts about the official answer. Typed questions (short answers, numbers, written explanations) have a "Copy for Claude" button that copies a ready-to-paste marking prompt. It also tracks which questions need another look on that device.

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
- **Question types:** `single` (`choices`, `answer: [i]`), `truefalse` (`choices: ["True","False"]`), `multi` (`choices`, `answer: [i, …]`, optional `negativeMarking`) `match` (`pairs: [{prompt, answer}]`, `options`), `short` (`accept: ["…"]`, optional `caseSensitive`), `numeric` (`parts: [{label, answer, tolerance or relTolerance, marks, unit}]`, optional `grid`, `inputHint`, `solution`) and `written` (`modelAnswer`, `rubric: [{point, marks}]`, self-marked). Answer indices are zero-based. See `CLAUDE.md` for the full rules. Optional fields: `marks` (default 1), `explanation`, `keyDispute`, `emphasis`, `image: {src, alt}` and `source`.
- **Source papers are verbatim** (past papers, practice quizzes, tutorials): never edit their wording. If an answer looks wrong, add a `keyDispute` instead of changing `answer`.

Then run:

```sh
node tools/build-data.cjs        # validates every set and regenerates generated/quizy-data.js
node tools/check-verbatim.cjs    # past-paper, practice-quiz and tutorial text in the bundle is byte-identical to data/
node --test "tests/*.test.cjs"   # scoring and question-type tests (Node's built-in runner, no installs)
```

The build checks unique ids, answer ranges, images, mark totals and each question type's own rules. Commit **both** the JSON and `generated/quizy-data.js`. The generated JavaScript lets the page work when opened directly from a local file; GitHub Pages reads the JSON.

Do not put private information in the question bank because a published site is public. Lecture PDFs are deliberately not included; use your course copies when checking a source.

## Code layout

Plain HTML, CSS and JavaScript with no build step, so `index.html` also works from `file://`. The scripts are classic `<script defer>` files that share one `window.Quizy` namespace, loaded in order by `index.html`:

```
src/core/      helpers, seeded random (?seed=N, for tests), storage, data loading, scoring, app state
src/types/     one file per question type (single, truefalse, multi, match, short, numeric, written) + registry.js
src/ui/        theme, subject tabs, setup panel, quiz panel, "Copy for Claude", summary, view switching
src/main.js    boot
styles/        tokens, base, layout, components, question, types/<type>.css, views
tools/         build-data.cjs, check-verbatim.cjs
tests/         node:test files, a fixture set for the new types; smoke.md describes the browser check
```

See `CLAUDE.md` for how to add a question type, a set or a subject.
