# Quizy

A small, phone-friendly DVE MCQ practice app. It shuffles both the question order and answer positions for every new round. After answering, it shows the explanation and tracks which questions need another look on that device.

## Open it

- On a computer, double-click `index.html`.
- On a phone, publish this repository with GitHub Pages (Settings → Pages → Deploy from a branch → main / root), then open the Pages URL. A GitHub repository link alone shows code, not the quiz website.

The app is static: no account, backend, or package installation. Progress is stored in the current browser only. The initial bank contains the Lecture 1 questions covered so far.

## Add questions

Edit `questions.json`, keeping each `id` unique and `answerIndex` zero-based. Run `node build-data.cjs` and commit **both** `questions.json` and `questions-data.js`. The generated JavaScript lets the page work when opened directly from a local file; GitHub Pages reads the JSON. Do not put private information in the question bank because a published site is public.

Each question records its source lecture and slide number. Lecture PDFs are deliberately not included in this public-ready repository; use your course copies when checking a source.
