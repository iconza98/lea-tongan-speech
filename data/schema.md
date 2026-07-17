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
| `tongan` | string | ✓ | The Tongan sentence to read. |
| `english` | string | ✓ | English gloss (seeded from curated data / Azure MT; correctable). |
| `source` | enum | ✓ | `curated` \| `azure-mt` \| `community` \| `manual` — provenance of the text. |
| `tags` | string[] | | Topic/domain (e.g. `greetings`, `numbers`, `everyday`). For coverage analysis. |
| `targetRecordings` | number | | Coverage goal: how many distinct speakers we want for this prompt. |
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

## Seed prompts

Prompts are seeded (not recorded) first, so contributors have something to read:

- Pull Tongan sentences + English glosses from the app's curated word/phrase data and Everyday Tongan
  content; where English is missing, seed it via Azure MT and mark `source:azure-mt` for later human check.
- See [`seed-prompts.example.jsonl`](./seed-prompts.example.jsonl) for the shape.
