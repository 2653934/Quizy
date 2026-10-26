# Quizy agent instructions

## Start here

- Read `CLAUDE.md` in full before making changes. It is the canonical, detailed guide to this repository's architecture, data rules, workflows, and browser checks.
- Inspect `git status` before editing and preserve unrelated user changes.
- Use a dedicated feature branch for changes unless the user explicitly requests otherwise.
- Do not commit, merge, push, publish, or alter GitHub Pages unless the user explicitly asks.

## Project constraints

- Quizy is a static, phone-first app built with plain HTML, CSS, and JavaScript.
- Do not introduce a framework, bundler, CDN, or runtime dependency unless explicitly requested.
- Keep the app working from both `file://` and GitHub Pages.
- Browser scripts are classic deferred scripts sharing the `window.Quizy` namespace; do not convert them to ES modules.
- Core and question-type files must remain safe to load in Node tests without accessing browser globals at module load time.
- Preserve accessibility, keyboard behavior, responsive layouts, and mobile tap targets.

## Neutral naming and language

- Never use AI assistant, company, or model brand names in user-facing messages, UI copy, questions, answers, explanations, generated content, feature names, titles, filenames, directory names, branch names, identifiers, or test names.
- Use neutral terms such as `AI assistant`, `assistant`, `AI feedback`, or a purpose-specific description instead.
- Do not propagate a brand name from existing legacy code or documentation into anything new. Refer to an existing legacy filename only when technically necessary, and keep that reference internal.

## Question data

- Edit question sources under `data/`; never edit `generated/quizy-data.js` by hand.
- Rebuild the generated bundle after changing question data.
- Do not rewrite source-paper wording. For disputed official answers, use `keyDispute` as documented in `CLAUDE.md`.
- Do not add private information or unpublished course material to the public question bank.

### Course content sources

The source material for questions, answers, explanations, mock tests, and other study content is stored outside this repository under `C:\Users\zayds\OneDrive\Documents\Wits\2026\02 Semester 2`:

- DO: `C:\Users\zayds\OneDrive\Documents\Wits\2026\02 Semester 2\COMS4050A - DO`
- NLP: `C:\Users\zayds\OneDrive\Documents\Wits\2026\02 Semester 2\COMS4054A - NLP`
- DVE: `C:\Users\zayds\OneDrive\Documents\Wits\2026\02 Semester 2\COMS4060A - DVE`

When adding or checking quiz content, inspect the relevant course folder and base the material on the files there. Treat those files as source material: do not modify, rename, move, or delete them unless the user explicitly asks.

### Content integrity and provenance

- Do not invent factual material. Every factual answer must be supported by the relevant course files. If the source is missing, unclear, or ambiguous, flag the uncertainty instead of guessing.
- Record provenance wherever possible, including the source document, lecture or tutorial, and page or question number. Never fabricate citations, page numbers, lecture numbers, quotations, or source labels.
- Keep lecturer-authored material separate from newly written practice material. Clearly label generated practice questions and never present them as lecturer-authored or source-verbatim.
- Keep existing subject, set, and question IDs stable because saved learner progress depends on them. Change an existing ID only when the user explicitly requests it and the compatibility impact has been handled.
- If sources conflict, preserve the original wording and document the conflict with the appropriate dispute or study-note field rather than silently choosing or rewriting an answer.
- Do not bulk-copy course documents into this public repository. Include only the minimum source content needed for the quiz and its explanations.
- Before publishing new course content, verify that it is appropriate and permitted to place in the public repository. Do not push or publish without the user's explicit approval.

## Verification

Run the relevant focused checks while developing. Before handing off a completed code or data change, run all of:

```sh
node tools/build-data.cjs
node tools/check-verbatim.cjs
node --test "tests/*.test.cjs"
```

Also run `node --check` on changed JavaScript files and `git diff --check`.

For visual or interaction changes, follow the browser checks in `tests/smoke.md` at phone and desktop widths. Confirm there are no console errors, horizontal overflow, undersized tap targets, or regressions in `file://` behavior.

## Scope

- Keep changes focused on the user's request.
- Update tests and documentation when behavior changes.
- Treat the "Out of scope" section in `CLAUDE.md` as binding unless the user expands the scope.
