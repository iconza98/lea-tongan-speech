# data/

Corpus schema + eval gold-set fetch scripts. **No audio is committed here** (see `.gitignore`).

- `schema.*` — the clip/corpus data model *(TBD — Phase 1)*:
  `{clipId, audioPath, tongan, english, speakerId, dialect?, ageBand?, gender?, consentVersion, status}`.
- Seed prompts + English glosses. **Provenance is constrained by
  [`docs/adr/0005`](../docs/adr/0005-prompt-text-provenance.md)**: prompt text may only be
  own-authored, community-contributed, or public domain — never the app dictionary's `churchward`
  (in copyright) or `ncea-l1` (CC BY-NC) entries, and never machine-translated Tongan. Prompt text
  is published permanently in every release, so it cannot be corrected after the fact.

> **`seed-prompts.example.jsonl` shows the *shape*, not the target.** Its rows use only attested
> text, so they are all well under the 4–10 s utterance target in [`schema.md`](./schema.md) — the
> longest attested public-domain Tongan sentence available to us is 9 words. Real seed prompts have
> to be **authored by fluent speakers**; no existing clean source reaches the target length.
>
> Two known follow-ups in that file: `every-001` carried an ambiguous `source: azure-mt` under the
> old single-field schema, so it is unclear whether the *Tongan* or only the *English* was
> machine-generated — a fluent speaker must confirm before it is seeded for real. And the two
> `pc-*` rows need the fluent-speaker typo pass documented in the Peace Corps attribution.
- `fetch-goldsets.*` — download scripts for UCLA/NCEA **eval** data into a git-ignored local path.
  This data is CC BY-NC / BY-NC-SA: **evaluation only, never training, never redistributed.**

Published corpus audio lives in the Storage bucket and the Hugging Face Dataset mirror.
