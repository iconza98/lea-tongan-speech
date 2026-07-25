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
> text, so they are all well under the 4–10 s utterance target in [`schema.md`](./schema.md). Real
> seed prompts have to be **authored by fluent speakers**: the phrasebook and vocabulary sources
> available to this project top out at single words and short turns, so none of them reach the
> target length.
>
> Rows carrying `status: "draft"` are **not seeded and not served** — `scripts/seed-prompts.mjs`
> skips them. They are waiting on a fluent speaker:
>
> - `every-001` is `textSource: "unverified"`. Under the old single-field schema it was
>   `source: "azure-mt"`, which left it ambiguous whether the *Tongan* or only the *English* was
>   machine-generated. It cannot be promoted to `active` until that is resolved. **Note it is
>   already live and already has an approved clip recorded against it**, from before this rule
>   existed — resolving its provenance is outstanding work, not a hypothetical.
> - The `pc-*` rows are public-domain Peace Corps text. The two documented orthographic fixes
>   (`ʻlo` → `ʻIo`, `siʻiisiʻi` → `siʻisiʻi`) are already applied, but the full fluent-speaker pass
>   over the source has not been done, so they stay `draft`.

Run `node scripts/check-prompts.mjs` before seeding anything — `seed-prompts.mjs` runs it too and
refuses to write if it fails.
