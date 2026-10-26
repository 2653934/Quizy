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

## Question data

- Edit question sources under `data/`; never edit `generated/quizy-data.js` by hand.
- Rebuild the generated bundle after changing question data.
- Do not rewrite source-paper wording. For disputed official answers, use `keyDispute` as documented in `CLAUDE.md`.
- Do not add private information or unpublished course material to the public question bank.

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
