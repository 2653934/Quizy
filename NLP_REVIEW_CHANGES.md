# NLP review: Scaling NLP (2026 deck) and transcript gaps (2026-11-08)

Branch `feature/nlp-scaling-2026`. Sources: the owner's Obsidian notes (`Lecture 10 - Scaling NLP - Slide Notes.md` for the 45-slide HTML deck, the ten lecture transcripts, the per-lecture summaries and `Prep/Devon Exam Signals - All Lectures.md`).

## 1. Lecture numbering now follows Moodle
- **L9 = Responsible NLP, L10 = Scaling NLP** (it used to be the reverse, after the old slide PDFs).
- The files were swapped: `bank-lecture-9.json` now holds Responsible NLP and `bank-lecture-10.json` holds Scaling. Set titles and descriptions were updated.
- Lecture tags were swapped in the tutorial (7.x → L9, 8.1 → L10), the mock exam (a49, a50, b5 → L9) and the model sheet (cards and section titles).
- "Lecture 9/10" and "L9/L10" were swapped in the text of generated sets and the model sheet. Source-paper text was not touched, and slide file names (`lecture10_responsible_nlp.pdf`) were kept.
- **Question ids are unchanged**, so progress is kept. The Responsible questions keep their `nlp-b10-…` ids and the old Scaling ones keep `nlp-b9-…`.

## 2. Scaling NLP bank (L10), checked against the 2026 HTML deck
**Removed** (topics only in the old 2025 PDF, not in the new deck or the recording):
- `nlp-b9-001` (the induction-head "phase change" framing)
- `nlp-b9-003` (Kaplan fit constants calculation)
- `nlp-b9-007` and `nlp-b9-008` (RIMs / modularity)
- `nlp-b9-009` and `nlp-b9-010` (knowledge distillation)
- `nlp-b9-011` (old data-poisoning slides; model collapse is covered in L9)

**Corrected:**
- `nlp-b9-004`: the "Zipf distribution" option (not in the new deck) was replaced by the log–log / forecasting point. The answer is now a, b, c.
- `nlp-b9-002`, `-005`, `-006`: explanations and slide references updated to the new deck. MoE is now described with a router and top-k, as the deck does.
- `nlp-b9-012`, `-013`: kept, with a link to Part 7.

**Added:** 47 new questions (`nlp-scale-001` … `-047`) covering all 7 parts:
- Scaling laws and Chinchilla
- Mixture of experts and load balancing
- In-context learning, induction heads and the $p^L$ emergence argument
- RAG
- Diffusion LMs, block diffusion and Transfusion
- RLHF, DPO and RLVR/GRPO
- Superposition, SAEs, the logit lens / J-lens and J-space

They include 10 calculation questions (all numbers checked by script) and 7 written questions with rubrics. The bank is now 53 questions / 109 marks.

**Model sheet:** the two old L10 cards were rewritten (ids kept) and five were added: in-context learning and induction, RAG, diffusion LMs, post-training, superposition and J-space. The sheet now has 57 cards.

## 3. Gaps filled from the transcripts
These are things Devon flagged in the recordings that the banks didn't cover yet:
- **L2** (8 questions): embedding layer = linear layer on a one-hot input ("I may ask this"), likelihood vs probability, the independence assumption, why exp (propensities), softmax → sigmoid in negative sampling, CBOW's attribution weakness, the cross-lingual linear map, and a 6-mark written question on skip-gram.
- **L3** (3 questions): BoW / bigram / large n-gram trade-offs, the bias as a class prior, max vs mean pooling.
- **L4** (8 questions): receptive vs effective receptive field (definition + calculation), the "two primary RNN problems" as Devon worded them, why $W_h$ isn't the identity, why tanh (and its cost), from-scratch vs pre-trained embeddings, anti-curriculum, and BPE facts (ordered merge table, deterministic, tokenizer ≠ embeddings).
- **L9** (3 questions): value lock, the grounded teacher–student synthetic-data loop, the Lewis signalling game.

## 4. Tests and docs
- `tests/paper.test.cjs`: the "too few quiz marks" case used NLP L9 alone (old Scaling, 23 marks). L9 is now the big Responsible bank, so the case uses L10 with NLP's 50/50 sections instead.
- `tests/reference.test.cjs`: card sources may now cite the HTML deck.
- `CLAUDE.md` was updated (numbering, sources, counts).
- Build, the verbatim check and all 96 tests pass. The browser smoke scripts were not re-run (this change is data only; the new questions use existing types).
- The local bank scripts in `tmp/nlp/` (`bank-9.cjs`, `bank-10.cjs`) still use the old numbering. Don't regenerate the L9/L10 banks from them without updating them first.

# Source-paper review and consistency pass (2026-11-09)

Sources, in order of authority: the six PDFs in `02 Practice Questions` (quiz 1 and quiz 2 read as page images), the ten lecture transcripts, the lecture summaries' 🎯 sections and `Prep/Devon Exam Signals - All Lectures.md`.

## 5. Are the source-paper sets up to date and complete?
All four sets are complete and up to date. **No questions were missing, extra or out of date, so none were added.**

| Set | Compared against | Result |
|---|---|---|
| `practice-quiz` | `NLP_Practice_Quiz-2.pdf` (adds §6 Transfer Learning) | 22/22 questions, §6.1–6.4 already present. Every question and choice string matches the PDF text (the only difference is a line-break hyphen, "down-stream"). |
| `tutorial` | `NLP_Tutorial-2.pdf` (adds 4.6, 5.3, 5.5, 6.3, §7.1–7.3, 7.6, §8) | 35/35 questions in the new numbering. Text matches; 3.2, 4.2, 5.4 and 6.6 have the equations as LaTeX (allowed markup). |
| `past-quiz-1-2025` | `NLP quiz 1.pdf` (scan, 11 pages) | 38/38 questions, text matches the scan. The inferred answers follow from the marks: Q32 (picks a✗ b✓ c✗ f✓, score 0 ⇒ C = W = 4 ⇒ {b, e, f, h}) and Q35 (b✗ d✓, score 0 ⇒ C = W = 2 ⇒ {c, d}). |
| `past-quiz-2-2025` | `NLP quiz 2.pdf` (scan, 12 pages) | 25/25 questions, and the answers match the "correct answer is" lines. Q14 says "there are more choices than necessary", but the review only shows the 4 used options, so the unused ones can't be recovered. |

## 6. Lecture tags (Moodle order)
- All tags follow the Moodle order: tutorial 7.x → L9, 8.1 → L10 (already done in §1), and the mock exam, the banks and the model sheet agree.
- **Changed:** `nlp-q1-10` (effective receptive field) L3 → **L4**. Devon defines "receptive field" and "effective receptive field" in the L4 recording (his CNN recap). The L3 recording and the slides never name them, and the L4 bank already holds the receptive-field questions.
- **Left as is:**
  - "Embedding layer = linear layer" (`nlp-pq-4-1`, `nlp-q1-19`) stays L5, as in the practice quiz's own section, although Devon flagged it in L2. Its note now says so.
  - The iterated-learning questions in the L8 bank (`nlp-b8-039`…`-042`, `-051`) stay L8 because the slides are in the L8 deck, but Devon taught them in the L9 recording.

## 7. Answers, keyDisputes and study notes
No `answer` field was changed.

**`past-quiz-1-2025`**
- `nlp-q1-10`: study note rewritten (receptive vs effective receptive field, where Devon defines them); tag → L4.
- `nlp-q1-25` (perplexity 1…|V|): **keyDispute added**. It is marked correct and is the course framing (Devon, L5: "an upper bound which is intuitive"), but strictly |V| is only the uniform model's value. The study note now quotes the L5 derivation.
- `nlp-q1-28` (nucleus): the note adds the sampling step and Devon's "pick uniformly" against the standard renormalise-and-sample.
- `nlp-q1-34` (SVD): **keyDispute added** and the note rewritten. In the 2026 L1 recording Devon said "the word representations are not the singular vectors": they are the rows of U. Pick (a) on the quiz; write "rows of U" in a written answer.

**`past-quiz-2-2025`**
- `nlp-pq2-02` (beam search "coherence and diversity"): **keyDispute rewritten** with the L6 recording (Devon framed beam search as approaching the most probable sentence, with memory as the cost, and never as adding diversity). The note now lists his pros and cons.
- `nlp-pq2-03`: the note quotes Devon on initial vectors as a diversity source.
- `nlp-pq2-22` (ELMo "not recurrent"): **keyDispute strengthened** with the L8 recording ("we're going to then run a LSTM… a recurrent neural network… two layers to the recurrence").

**`practice-quiz`**
- `nlp-pq-4-1`: **keyDispute updated**: 2025 Quiz 1 Q19, the same statement, was marked True. The note cites Devon's "I may ask this" (L2).
- `nlp-pq-5-4` (softmax "sparse"), `nlp-pq-6-3`/`-6-4` (ELMo) and `nlp-pq-4-3` (nucleus) were checked against the recordings; they already quote Devon. No change.

**`tutorial`** (unofficial, so model answers and rubrics were improved against each lecture's 🎯 section; marks unchanged):
- **2.1** Skip-gram vs CBOW: adds CBOW's attribution problem and Devon's preference for skip-gram (rubric point 4).
- **2.2** Negative sampling: adds softmax → binary sigmoid decisions (Devon: "As long as you understand how Word2Vec goes from the softmax classification to the sigmoid, I am happy"; rubric point 2).
- **3.3**: the note says Naive Bayes / generative vs discriminative were removed from the 2026 course.
- **5.2** Two primary RNN weaknesses: the model answer now gives Devon's L4 wording (fixed-size vector + credit assignment, with vanishing/exploding accepted). The rubric accepts any two of the three.
- **6.2** BERT: input = token + segment + position embeddings; why [CLS] becomes a summary (NSP).
- **6.5** LoRA: how it works (no non-linearity, in parallel, mergeable), r(d + k) vs dk with Devon's 30×10 example, and frozen W → no gradients. The rubric was reworked.
- **7.1** Reader/writer responsibility: NLP assumes the writer-responsible view (distributional hypothesis, prompting); rubric point 3.
- **7.2** Code-switching: Devon's bias, which the old answer missed: a switch is an unlikely next token, so LLMs smooth it away. Rubric points 2–3.
- **7.3** Expressivity/regularity: adds the iterated-learning experiment. The note no longer says "Lecture 8" (taught in the L9 recording).
- **7.5** Stochastic parrots: coherence as a surrogate, shared context and intent, hegemonic viewpoint and value lock.
- **7.6** Model collapse: **corrected**. The old answer said perplexity on real data rises. Devon's identification is that the perplexity distribution of generated text shifts left (very low) with a long tail, and why that is collapse (language needs some surprise). Rubric rewritten.
- **8.1** Mechanistic interpretability: examples from the 2026 deck (induction heads, superposition/SAEs, logit lens / J-lens) instead of Golden Gate Claude (Devon said the L5 interpretability readings aren't tested), plus "examined at a high level".

## 8. Generated sets: consistency pass
Checked new-questions, label-diagrams, mock-exam and bank-lecture-1…10:
- Every reference to Lectures 8–10 in question text and notes.
- The L9/L10 tags (every L9 concept is Responsible NLP; every L10 concept is Scaling).
- The themes the recordings settle: model collapse, beam search, perplexity bounds, nucleus sampling, ELMo, SVD word vectors, RNN problems, Naive Bayes.

Nothing still uses the old numbering, and no tag is wrong. One note was changed:
- `nlp-b10-040` (bank L9, languages and collapse): the explanation adds Devon's "lower resource languages collapse faster than English and French".

Already consistent, no change: `nlp-b4-020` (Devon's two RNN problems); `nlp-b5-030`, `nlp-b5-044`, `nlp-mock-a23` and the model sheet (nucleus, "pick uniformly" flagged); `nlp-b10-038`, `nlp-b10-055`, `nlp-mock-a50` (collapse via perplexity); `nlp-b6-017` (beam pros and cons); `nlp-b8-005`, `nlp-new-039` (ELMo recurrent).

## 9. Layout fix found by the smoke checks
At 375px the NLP setup screen scrolled sideways (434px): the Quiz set `<select>` took the width of its longest title, "Practice bank: Lecture 3 (Text classification and CNNs)". This was already true on the previous commit. `styles/base.css` now gives `.form-row` a `minmax(0, 1fr)` column, so the select fits the screen.

## 10. Validation
- `node tools/build-data.cjs` (counts unchanged: NLP 17 sets, 661 questions, 1559 marks), `node tools/check-verbatim.cjs` (636 strings) and `node --test "tests/*.test.cjs"` (96/96) all pass.
- Smoke checks (Playwright + Edge, `file://` and HTTP, 375 and 1280): `newtypes.cjs`, `nlp-sheet.cjs` and `mobile.cjs` pass.
- `paper.cjs` plays every paper through, but some of its checks are out of date (30/20 sections, "/ 50 marks", the old set list), while NLP papers are now 50/50. They fail the same way on the previous commit. Its sideways-scroll failures are gone after §9.

## 11. Proposal (not implemented): declutter the NLP "Quiz set" dropdown
The dropdown has 18 entries ("Everything in NLP" + 17 sets), ten of them "Practice bank: Lecture N". What matters for the options:
- Progress is stored per question id, so it doesn't depend on which set a question is in.
- Mock papers draw from every set of the subject and use the set's kind (`generated` = new).
- The model sheet's "Practise these questions" opens Browse with "All sets" + a lecture chip.
- So only the dropdown, the Browse set filter and the `tmp/nlp/bank-<n>.cjs` scripts (one file per lecture) care how the banks are split into sets.

**A. Merge the ten banks into one set `nlp-practice-bank` ("Practice bank (all lectures)"), keeping every question id.**
- ✅ Progress kept (ids unchanged). Mock papers unchanged (still `generated` → new). "Practise these questions" unchanged. Dropdown down to 9 entries. Lecture chips do the per-lecture filtering, as in "Everything in NLP".
- ❌ The ten bank scripts write `bank-lecture-<n>.json`, so they would need a merge step (or would write into one file), and `coverage.cjs` would read the merged file.
- ❌ Choosing one lecture's bank becomes "Practice bank" + a chip (two taps instead of one).
- ❌ The per-set descriptions (sources per lecture) become one long description.
- ❌ Every published set id `nlp-bank-lecture-N` disappears, though question ids, which are what progress uses, stay.

**B. Group the dropdown with `<optgroup>` (recommended).** Add an optional `"group"` to the set header ("Lecturer's papers", "Practice", "Practice banks by lecture") and have `setup.js` and the Browse set filter put options in `<optgroup>`s, with shorter labels inside the bank group ("L3 · Text classification and CNNs").
- ✅ No data moves: set ids, question ids, progress, mock papers, the bank scripts and the model-sheet links are all untouched. It also shortens the longest option.
- ✅ Works the same for DO's 13 sets if wanted.
- ❌ Still 18 entries, just labelled into three blocks. On phones the native picker shows group headings, which helps but doesn't shorten the list.
- ❌ A small code change (setup, browse, the build check for `group`, a test).

**C. A pooled entry like "Everything in NLP": "All practice banks".** Add an optional `"pools": [{"id": "nlp-banks", "title": "All practice banks", "sets": [...]}]` to the subject and show it instead of the ten banks (or above them, collapsed in an optgroup).
- ✅ One entry instead of ten, with no data moved, so ids, progress, scripts and links stay as they are.
- ❌ More code than B: a third "kind" of set choice in setup, browse and the round summary, beside "Everything in …".

I'd do **B** now (cheap, no risk to data) and consider C later if the list still feels long.
