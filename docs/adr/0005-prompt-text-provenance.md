# 0005 — Prompt text provenance: own-authored and public-domain sources only

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

Every prompt's `tongan` string and `english` gloss is **published** — it lands in `metadata.jsonl`
in each dataset release under **CC BY 4.0**. And per [`0002`](./0002-consent-model.md) and
`docs/CONSENT.md`, a release is **permanent and cannot be recalled**. So the licence of the *text*
we ask contributors to read is as consequential as the licence of the audio they record, and it is
equally irreversible.

The obvious place to find thousands of Tongan sentences is the Lea Fakatonga app's dictionary. It
holds 20,735 entries — but they are not one thing:

| `source` | entries | share | licence status |
|---|---|---|---|
| `churchward` | 19,744 | 95.2% | C.M. Churchward, *Tongan Dictionary* (1959) — in copyright |
| `ncea-l1` | 588 | 2.8% | CC BY-NC — already firewalled as evaluation-only |
| `curated` | 403 | 1.9% | own content — clean |

`data/schema.md` previously said to *"pull Tongan sentences + English glosses from the app's curated
word/phrase data."* Read narrowly (the 403 `curated` entries) that is safe. Read as "the app's
dictionary" it would push Churchward and NCEA text into a permanent CC BY 4.0 release — breaching
exactly the licence firewall this project maintains rigorously everywhere else
(`CONTRIBUTING.md` rule 4, `model/g2p/ATTRIBUTION.md`, the UCLA/NCEA eval-only boundary).

The corpus also needs to grow from 5 prompts to several hundred, so this instruction was about to be
acted on at scale.

## Decision

**Only two kinds of source may supply prompt text:**

1. **Own-authored** — sentences written for this project by fluent speakers, or contributed through
   the site under the CC BY 4.0 grant.
2. **Public domain** — e.g. the U.S. Peace Corps *Basic Tongan Language Lessons*
   (17 U.S.C. §105; see `peacecorps-tongan/ATTRIBUTION.md` in the app repo).

Everything else is **reference-only** and must never become prompt text: Churchward (in copyright),
NCEA (CC BY-NC), UCLA (CC BY-NC-SA), Shumway (© UH Press).

**Scope, precisely.** Individual Tongan words are not protectable — a fluent speaker writing
*"ʻOku ou fie inu vai"* is clean even though *vai* appears in Churchward. What is protected is a
dictionary's **compilation, its definitions, and its example sentences**. So:

- Using the 403 `curated` entries as *vocabulary to write sentences from* — fine.
- Copying dictionary entries, definitions, or example sentences into prompts — **not** fine.
- Bulk-seeding prompts from `dictionary.json` — **not** fine.

**Machine translation may not generate Tongan.** MT-seeded *English glosses* are allowed but must be
flagged for human check; MT-generated *Tongan* is forbidden, because unidiomatic prompt text becomes
permanent training data and contributors will read it aloud as if correct.

This is recorded as a **decision rule, not a legal finding**. Churchward's copyright status in Tonga
and New Zealand has not been assessed, and we may or may not hold a licence. The rule is correct
either way; if a licence is later obtained, amend this ADR rather than working around it.

## Consequences

**Positive**
- The published dataset stays cleanly CC BY 4.0, so the models trained on it stay commercially
  usable — the same reasoning that keeps UCLA/NCEA out of training data.
- The constraint is enforceable in code: prompts carry `textSource`, and a seeding check can reject
  disallowed values before anything reaches a release.
- Removes an ambiguity that was about to be acted on at scale.

**Negative / trade-offs accepted**
- **403 usable entries instead of 20,735.** The large dictionary is off the table as a text source,
  which is most of why the prompt corpus has to be written rather than generated.
- **Sentence authoring becomes the project's bottleneck**, and it competes for the same scarce
  fluent-speaker time as recording does.
- Public-domain material needs a correctness pass before use — the Peace Corps source has known
  orthographic errors (`ʻlo` → `ʻIo`, `paanga` → `paʻanga`, `siʻiisiʻi`) documented in its
  `ATTRIBUTION.md`.

## Alternatives considered

| Option | Why not |
|---|---|
| **Seed prompts from the full dictionary** | Fastest path to thousands of prompts, and the reason this ADR exists. Puts in-copyright and BY-NC text into a permanent, unrecallable CC BY 4.0 release. |
| **Use dictionary text, publish audio only** | The transcript *is* the training target for TTS/STT; a dataset of audio without text is useless. `metadata.jsonl` cannot be omitted. |
| **Relicense the dataset to BY-NC** | Would permit NCEA/UCLA text, but makes every model trained on it non-commercial — inverting the project's stated goal (`README.md`: "so the models stay commercially usable"). |
| **MT-generate Tongan prompts** | Scales instantly, but bakes unidiomatic Tongan into a permanent corpus, and contributors reading it aloud would lend it false authority. |
