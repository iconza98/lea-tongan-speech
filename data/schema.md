# Corpus schema

The data model for the Lea Tongan Speech corpus. One **clip** = one **speaker** reading one
**prompt**. The same schema serves all three downstream models:

- **TTS** — train on `(transcript → audio)`
- **STT** — train on `(audio → transcript)`
- **Translation** — train on `(transcript ↔ english)` and, for speech translation, `(audio → english)`

Because we can't re-collect or re-consent later, every field below is decided *before* the
contribution site is built.

---

## Entities

Three Firestore collections, plus operational ones.

### `prompts/{promptId}` — the text to be read (reused across many speakers)

| Field | Type | Req | Notes |
|---|---|---|---|
| `promptId` | string | ✓ | Stable id. |
| `tongan` | string | ✓ | The Tongan sentence to read. **Target 4–10 s when read aloud** (~10–18 words) — see *Utterance length* below. |
| `english` | string | ✓ | English gloss. |
| `textSource` | enum | ✓ | `authored` \| `community` \| `public-domain` — provenance of the **Tongan**. Constrained by [`adr/0005`](../docs/adr/0005-prompt-text-provenance.md); MT is not a permitted value. |
| `glossSource` | enum | ✓ | `authored` \| `community` \| `public-domain` \| `azure-mt` — provenance of the **English**. `azure-mt` is allowed but means "not yet human-checked". |
| `glossChecked` | boolean | | `true` once a fluent speaker has verified an MT-seeded gloss. |
| `tags` | string[] | | Topic/domain (e.g. `greetings`, `numbers`, `everyday`). For coverage analysis. |
| `targetRecordings` | number | | Coverage goal: how many distinct speakers we want for this prompt. **Default 2** — see *Coverage* below. |
| `status` | enum | ✓ | `active` \| `retired`. |
| `createdAt` / `updatedAt` | timestamp | ✓ | |

### `speakers/{speakerId}` — a contributor (pseudonymous, no PII)

| Field | Type | Req | Notes |
|---|---|---|---|
| `speakerId` | string | ✓ | **Random** id, given to the contributor for withdrawal requests. Never a name. |
| `demographics.island` | enum\|null | | See enums. Optional, consented. |
| `demographics.ageBand` | enum\|null | | Optional, consented. |
| `demographics.gender` | enum\|null | | Optional, consented. |
| `consentVersion` | string | ✓ | Latest consent text this speaker accepted. |
| `clipCount` | number | ✓ | Denormalized count. |
| `authUid` | string\|null | | **Private, server-only, NEVER exported.** Optional link to an anonymous Firebase Auth uid, only to help a contributor find their own clips. |
| `createdAt` / `updatedAt` | timestamp | ✓ | |

> **PII rule:** `speakers` never stores a legal name, email, or phone. `authUid`, if present, is
> stripped from every export. The published `speaker_id` is the random `speakerId` only.

### `clips/{clipId}` — one recording (the training unit)

| Field | Type | Req | Notes |
|---|---|---|---|
| `clipId` | string | ✓ | Stable id. |
| `promptId` | string | ✓ | → `prompts/{promptId}`. |
| `speakerId` | string | ✓ | → `speakers/{speakerId}`. |
| `transcript` | string | ✓ | **What was actually said** in Tongan. Defaults to `prompt.tongan`; a reviewer may correct it if the speaker deviated. This is the ground truth for STT/TTS. |
| `english` | string | ✓ | English gloss (from prompt; correctable in review). |
| `audio.path` | string | ✓ | Canonical published object: `corpus/{clipId}/audio.flac`. |
| `audio.sourcePath` | string | ✓ | Raw upload: `submissions/{clipId}/source.<ext>`. |
| `audio.durationMs` | number | ✓ | |
| `audio.sampleRate` | number | ✓ | Canonical **24000**. |
| `audio.channels` | number | ✓ | Canonical **1** (mono). |
| `audio.codec` | string | ✓ | Canonical `flac`. |
| `audio.originalCodec` | string | ✓ | e.g. `opus`. |
| `audio.bytes` | number | ✓ | Canonical file size. |
| `status` | enum | ✓ | `pending` \| `approved` \| `rejected`. |
| `qualityFlags` | string[] | | e.g. `clipped`, `background_noise`, `transcript_mismatch`, `truncated`. |
| `review.reviewerId` | string\|null | | Reviewer (from allowlist). |
| `review.reviewedAt` | timestamp\|null | | |
| `review.notes` | string\|null | | |
| `consent.version` | string | ✓ | e.g. `2026-07-16-v1`. |
| `consent.confirmedAge` | boolean | ✓ | 18+ / guardian box. |
| `consent.confirmedOwnVoice` | boolean | ✓ | |
| `consent.confirmedLicense` | boolean | ✓ | CC BY 4.0 box. |
| `consent.at` | timestamp | ✓ | When the boxes were ticked. |
| `releases` | string[] | | Dataset release versions that include this clip (e.g. `["2026.1"]`). Empty until published. |
| `createdAt` / `updatedAt` | timestamp | ✓ | |

### Operational

- `adminConfig/reviewers` — `{ emails: string[] }` reviewer allowlist (mirrors the app's gate pattern).
- `datasetReleases/{version}` — a frozen manifest of one published release (see Export).
- `evalRuns/{runId}` — model scorecards for the leaderboard (owned by `eval/`, listed here for context).

---

## Storage layout (own bucket, isolated from the app)

```
submissions/{clipId}/source.<ext>     raw upload (opus/webm), pre-review
corpus/{clipId}/audio.flac            canonical, transcoded, published clips only
```

Client writes go only to `submissions/…`. The canonical `corpus/…` object is written **only** by
the accept/transcode Cloud Function after a reviewer approves — same shape as the app's
`acceptAudioValidation` → `audio/{id}/{recordingId}.mp3` pipeline.

## Status lifecycle

```
upload → status:pending ──review──▶ approved ──release──▶ releases:[…]  (in the public dataset)
                          └────────▶ rejected  (source kept for audit or deleted per policy)
```

- **pending → approved/rejected**: human reviewer (allowlist).
- **approved → released**: an export run stamps `releases` with the version it went out in.
- **Withdrawal**: a speaker's future releases exclude their clips; already-released versions can't be
  recalled (as the consent states). Withdrawal sets `status:rejected` (or a `withdrawn` flag) so no
  future release picks them up.

## Canonical audio format — 24 kHz mono FLAC

Lossless (good for training), mono (single speaker per clip), 24 kHz resamples cleanly to 16 kHz
(Whisper/STT) and 22.05/24 kHz (ZONOS2/TTS). This is a real trade-off (size vs. fidelity vs. one
format for two model families) → decided in [`docs/adr/0001`](../docs/adr/0001-canonical-audio-format.md).
Raw uploads keep their original codec until transcode.

---

## Enumerations

```
island:  tongatapu | vavau | haapai | eua | niuatoputapu | niuafoou | diaspora | other | null
ageBand: 18-24 | 25-34 | 35-44 | 45-54 | 55-64 | 65+ | null
gender:  female | male | nonbinary | self_describe | null
```

All demographics are optional (`null` = "prefer not to say / skipped"). `self_describe` carries **no**
free-text field, to avoid PII leaking into a public dataset.

---

## Published dataset export (CC BY 4.0)

A release is a frozen snapshot of all `approved` clips at export time. Layout is
Hugging Face `datasets` audio-folder friendly:

```
lea-tongan-speech-{version}/
  clips/{clipId}.flac
  metadata.jsonl        one row per clip (HF maps `file_name` → audio)
  speakers.jsonl        speaker demographics
  README.md             dataset card (stats, coverage, licence, attribution)
  LICENSE               CC BY 4.0 notice
```

`metadata.jsonl` row:

```json
{"clip_id":"...","file_name":"clips/....flac","tongan":"...","english":"...","speaker_id":"...","island":"...","age_band":"...","gender":"...","duration_ms":0,"sample_rate":24000}
```

**Export never includes:** `authUid`, reviewer identities, raw `submissions/…` audio, `pending`/`rejected`
clips, or any UCLA/NCEA data. `speaker_id` is the pseudonymous random id only.

## Utterance length — prompts are sentences, not phrasebook entries

**Target 4–10 seconds of speech per prompt (mean ~7 s, roughly 10–18 Tongan words).** Keep about
15% short items so word-level lookups stay represented; the rest should be full sentences.

This is a hard-won constraint, not a preference. The corpus feeds a TTS model that is asked at
inference time to read **whole sentences** (`POST {text, speaker_audio, seed} → mp3`). A model
trained on 2-second fragments has never seen a long sequence, produces list intonation, and degrades
on exactly the input it exists to handle. The app repo's own research rejected two candidate corpora
for precisely this: the UCLA archive for being *"word-list citation form"*, and the app's existing
recordings for being *"short single-word clips, not continuous transcribed speech."*

Note this is **not** about phoneme coverage. Tongan has 12 consonants, 5 vowels × 2 lengths, and
strictly open (C)V syllables — only ~130 possible syllables, saturated by a few hundred sentences.
Length is about **prosody**.

Measured on the first 5 approved clips, this is not hypothetical:

| Clip | Duration |
|---|---|
| `Fēfē hake?` | 1,620 ms |
| `Mālō e lelei` | 1,740 ms |
| `ʻOku ou sai pē, mālō` | 2,100 ms |
| `ʻOku ou fie inu vai` | 2,580 ms |
| `Taha, ua, tolu` | 2,640 ms |
| **Total corpus** | **10.68 s** (mean 2.14 s) |

**Clip length is irreversible; corpus size is not.** A 2-second clip never becomes a 7-second clip,
but a small corpus becomes a large one by continuing to collect. Same reasoning as
[`adr/0001`](../docs/adr/0001-canonical-audio-format.md).

## Coverage — speaker-minutes, not prompt-fills

Track progress as **total approved audio duration**, not clip count:

| Milestone | Approved audio | ≈ clips @ 7 s |
|---|---|---|
| **M1** | 30 min | ~250 |
| **M2** | 2 hrs | ~1,000 |
| **M3** | 5 hrs | ~2,500 |

`targetRecordings` defaults to **2**, not 10. Ten speakers reading the same sentence teaches a TTS
model almost nothing past the second; the same contributor effort spent on ten *different* sentences
is worth far more. Breadth belongs in the **text**, not in repetition.

Multi-speaker breadth itself is correct and unchanged — many-speaker/shallow is a standard regime for
teaching a zero-shot voice cloner a new language (LibriTTS: 2,456 speakers, ~4 min each). Speaker
identity rides the model's conditioning pathway, so it need not be learned per-speaker.

## Seed prompts

Prompts are seeded (not recorded) first, so contributors have something to read. **Provenance is
constrained by [`adr/0005`](../docs/adr/0005-prompt-text-provenance.md)** — read it before seeding.

Permitted sources for the **Tongan** text:

- **Authored** by fluent speakers for this project (`textSource: authored`).
- **Contributed** through the site under the CC BY 4.0 grant (`textSource: community`).
- **Public domain** — e.g. the U.S. Peace Corps *Basic Tongan Language Lessons*
  (`textSource: public-domain`). Needs the fluent-speaker typo pass documented in its attribution.

**Not permitted as prompt text:** the app dictionary's `churchward` entries (in copyright) or
`ncea-l1` entries (CC BY-NC), UCLA (CC BY-NC-SA), Shumway (© UH Press), or any machine-translated
Tongan. Only the app's 403 `curated` entries are clean, and then as *vocabulary to write sentences
from* — never as copied text. Prompt text is published permanently in every release, so this cannot
be corrected after the fact.

English glosses may be MT-seeded (`glossSource: azure-mt`, `glossChecked: false`) and corrected later.

See [`seed-prompts.example.jsonl`](./seed-prompts.example.jsonl) for the shape.
