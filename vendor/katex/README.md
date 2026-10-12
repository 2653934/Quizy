# KaTeX 0.19.0 (vendored)

From the npm package `katex@0.19.0` (MIT, see LICENSE): `dist/katex.min.js`, `dist/katex.min.css` and the `.woff2` files of `dist/fonts/`, unchanged.
The stylesheet also names `.woff`/`.ttf` fallbacks; browsers that read woff2 never ask for them.
This is the only third-party code in Quizy. It is loaded by `index.html` and by `tools/build-data.cjs` (the UMD build works in Node).
To update: replace these files with the same ones from a newer release and run the build and tests.
