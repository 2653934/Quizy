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
