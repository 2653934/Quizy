# CLAUDE.md: Quizy

## What this is
Quizy is a small, static, phone-first practice-quiz site (plain HTML/CSS/JS, no framework, no build tools apart from one Node script). The owner is a Wits CS student who practises on their phone through GitHub Pages (`origin` = github.com/2653934/Quizy).

It is a multi-subject app. Each subject has its own theme and a list of quiz sets:

| key | Subject | Sets |
|---|---|---|
| `dve` | COMS4060A Data Visualisation & Exploration | `dve-lecture-bank` (421 questions, lectures 1–6) |
| `nlp` | COMS4054A Natural Language Processing | `nlp-past-quiz-2-2025` (25 questions / 50 marks) |
| `do`  | COMS4050A DO (full name not given yet; the owner calls it "DO") | none yet, so the app shows a "No quizzes yet" state |

There is no in-app editing, no accounts and no backend. Content is changed by editing JSON under `data/` and rebuilding.

## Hard rules
- **Past papers are verbatim.** Never reword, "fix" typos in, shorten or reformat the text of any question, choice or matching prompt in a set with `"kind": "past-paper"`. Typos such as "Bilnear", "capture by" and "called then classification token" are intentional transcriptions. The only things that may change are **the order of the questions and the order of the options**, randomised on every new round.
- **Don't change the given answers** (taken from the 'The correct answer is:' lines of the attempt review, not the student's picks). If an answer looks wrong, leave `answer` alone and add or keep a `keyDispute` string. The UI shows it after answering.
- `explanation` fields are study notes, not part of the paper. They are shown after answering, visually separate from the question.
- Stay static: it must work both when `index.html` is opened from disk (`file://`, using the bundled `questions-data.js`) and on GitHub Pages (fetching the JSON). No CDNs, frameworks or npm dependencies. Node is only used for `build-data.cjs`.
- Phone first: test at about 375px wide. Tap targets should be at least 48px tall, with no horizontal scrolling and readable maths/images.
- Keep the existing look (Georgia headings, ink borders, offset shadows). Themes only change the colour tokens.
- Don't break existing progress (see Storage). Never change the id of a question that has been published.

## File layout
```
index.html, app.js, styles.css, favicon.svg
build-data.cjs             # validates all sets and writes questions-data.js
questions-data.js          # GENERATED: window.QUIZY_DATA = { subjects, sets: {id: set} }. Don't edit.
data/
  subjects.json            # subject registry: key, code, name, theme, ordered set ids
  dve/lecture-bank.json
  nlp/past-quiz-2-2025.json
  nlp/img/q20-attention-map.png
  do/.gitkeep              # empty for now
```
**Set file rule:** a set with id `<subject>-<name>` lives at `data/<subject>/<name>.json` (e.g. `nlp-past-quiz-2-2025` → `data/nlp/past-quiz-2-2025.json`). `subjects.json` lists only ids; both `app.js` and `build-data.cjs` derive the path with this rule, and the build fails if the file, its `id` or its `subject` don't match.

### `data/subjects.json`
Each subject has `key`, `code`, `name`, `theme` and `sets` (ordered ids). `theme` holds four `#rrggbb` colours: `accent`, `paper`, `light`, `aside`. Keep white-on-accent text at ≥ 4.5:1 contrast and accent-on-paper text close to that (DO uses `#9a5c15` because the first suggestion, `#a8661b`, was too light). Current accents: DVE `#147d83`, NLP `#5b4bb7`, DO `#9a5c15`.

`app.js` (`applyTheme`) sets those four as CSS custom properties on `:root` and derives the rest by mixing colours: `--accent-dark` (hover), `--seal`, `--line`, `--track`, `--shadow`, `--field-line`, `--surface`, `--choice-bg`. It also updates `<meta name="theme-color">` and the favicon. `styles.css` `:root` holds DVE defaults for first paint. Don't hard-code theme colours in CSS; use the tokens. `--ink`, `--muted`, `--green`, `--bad` and `--warn` are shared by all themes.

### Set file header
`id`, `subject`, `title`, `kind` (`"lecture-bank"` | `"past-paper"` | `"practice-quiz"` | `"tutorial"` | `"generated"`), `description`, optional `totalMarks`, optional `negativeMarkingNote`, and `questions`. Extra metadata such as `sourceFile` and `transcriptionNotes` is allowed and ignored by the UI. `data/nlp/past-quiz-2-2025.json` is a complete example.

## Question schema
Common fields: `id` (globally unique), `lecture`, `concept`, `question` (may contain `\n`, rendered as line breaks), `type`, `marks` (default 1), `explanation`, optional `keyDispute`, optional `emphasis` (words shown in bold inside `question`, matched as whole words), optional `emphasisInChoices` (`{"<original choice index>": [words]}`), optional `image` `{src, alt}` (path relative to `index.html`), optional `optionsNote` (shown in small print under the study note), and optional `source`. DVE uses `source: {file, pages}` (required for `lecture-bank` sets); the NLP past paper uses `number`, the question's original number, shown as "Paper Q14".

| `type` | Fields | UI | Grading |
|---|---|---|---|
| `single` | `choices[]`, `answer: [i]` | Tap one option, which reveals the answer immediately | full marks or 0 |
| `truefalse` | `choices: ["True","False"]`, `answer: [i]` | Two buttons, **never shuffled** (True then False) | full marks or 0 |
| `multi` | `choices[]`, `answer: [i,…]`, `negativeMarking` | Checkboxes + "Check answer" (disabled until one is ticked). Shows "Select all that apply" and, if `negativeMarking`, the set's `negativeMarkingNote` | Moodle style (below) |
| `match` | `pairs: [{prompt, answer}]`, `options[]` | One `<select>` per prompt (prompts and options both shuffled) + "Check answer" (disabled until every row is filled) | `marks × (correct pairs / pairs)` |

**Moodle-style multi-select score:** with C correct and W wrong options, `score = marks × max(0, picked_correct / C − picked_wrong / W)`. Picking every option scores 0; 1 correct + 1 wrong with C=1, W=3 scores 0.667; 1 of 2 correct scores 0.5. A question counts as "correct" for progress only at full marks; partial marks appear in the feedback (e.g. "2.67 / 4 marks").

Shuffling happens per round in `app.js`: each round item stores `choiceOrder` / `pairOrder` / `optionOrder` as arrays of original indices, and grading always uses original indices. The question objects and their strings are never copied or modified, and options are re-lettered a., b., c. after shuffling.

After answering, options are marked correct, wrong-and-picked or missed-correct (dashed border, multi only), followed by the verdict and marks, the study note, and any `keyDispute` as a caution box.

## Rounds and summary
- Setup: subject switcher (segmented control, disabled during a round), then **Quiz set**, the set's `description`, **Lecture** (built from the set), **Questions** (all / only ones I got wrong), and a live count line. Past-paper sets show "N questions · M marks · order randomised".
- Stats and the seal count questions across the whole current subject.
- During a round, `show()` sets `<body data-view="quiz">` and `styles.css` hides the hero and the stats row and compacts the header: the subject switcher is disabled, keeps 48px tabs and hides their course-code line, and on phones the brand bar and top margins shrink. Both come back on the setup and summary screens (`data-view="setup"` / `"summary"`). The desktop side panel is unchanged.
- Scrolling: switching views scrolls smoothly to the top of the page. "Next question" smoothly scrolls the quiz panel into view (`scrollIntoView`, `scroll-margin-top: 12px`), so the progress bar, "End round" and the question are on screen. At 375×667 the question text must start within the first screen on every question (last measured 2026-10-11: at most 301px from the top, on question 1; later questions start nearer the top).
- Summary: sets with `totalMarks` show "31.5 / 50 marks" plus "X of N questions fully correct"; other sets show "X out of N correct".

## Storage
- `localStorage` only, every access wrapped in try/catch (the `store` helper). Progress key per subject: `quizy-attempts-v2-<subject>` holding `{[questionId]: {correct, score, at}}`.
- Migration: on load, if `quizy-attempts-v2-dve` is missing and `quizy-dve-attempts-v1` exists, the old value is copied over (the old key is kept). Old entries have no `score`, which is fine.
- Last subject: `quizy-last-subject`.

## `build-data.cjs`
Reads `data/subjects.json` and every set it references. It validates subject keys and theme colours, the set file rule, `kind`, unique question ids across all sets, `type`, answer indices in range (exactly one for `single`/`truefalse`, ≥ 1 for `multi`), `truefalse` choices exactly `["True","False"]`, `match` answers present in `options`, `image.src` files existing, `emphasis` words appearing in the text, and `totalMarks` matching the sum of marks. It then writes `questions-data.js` and prints counts per subject. `app.js` fetches `data/subjects.json` and the set files over HTTP and falls back to `window.QUIZY_DATA` on `file://` or when any fetch fails.

**Run `node build-data.cjs` after every data change, and commit the JSON together with the generated JS.**

## Verifying changes
Last full verification: 2026-10-11, all passing. For any non-trivial change, repeat:
1. `node build-data.cjs` passes, with the expected counts (DVE 421, NLP 25 / 50 marks, DO 0 at present).
2. For past-paper sets, confirm that every `question`, `choices`, `pairs` and `options` string in the bundled data is byte-identical to the source JSON.
3. Browser check (Playwright installed in a scratch folder, not the repo; `playwright-core` with `channel: 'msedge'` works on this machine): `file://` and a local HTTP server, at 375px and at desktop width. Switch subjects, play a round covering every type, and confirm that old progress still counts, nothing scrolls sideways, tap targets are ≥ 48px, and there are no console errors. At 375×667, after each question's scroll has settled, the question text, progress bar and "End round" must be on screen. (When waiting for smooth scrolling to finish, don't return a Promise from `page.waitForFunction`: it counts as truthy straight away. Poll `scrollY` inside `page.evaluate` instead.)

## Out of scope for now (don't build yet)
- Generated "similar" questions, the NLP practice quiz and the tutorial. These come later as new set files (written tutorial questions will probably need a `written` type with a "reveal model answer" + self-mark flow).
- In-app editing, accounts, sync, analytics.

## Open questions
- DO's full course name, if the owner wants it shown (currently `"code": "COMS4050A", "name": "DO"` in `subjects.json`).

## Note on publishing
GitHub Pages sites are public. University past-paper questions in a public repo may be against course rules. Mention this to the owner before pushing and don't push unless asked.
