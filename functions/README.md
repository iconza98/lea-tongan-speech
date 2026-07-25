# functions/

Accept/transcode + moderation pipeline (Cloud Functions, TypeScript, Node 22) for the open corpus.
Own Firebase project, isolated from the app.

> **Deployed and working (2026-07-25).** The "untested skeleton" warning that used to sit here is
> obsolete: all three functions have run in production — 5 clips submitted, transcoded to 24 kHz mono
> FLAC, and approved through `review.html` by a real reviewer.
>
> **These functions are now locally testable too.** They previously were not: under the *functions
> emulator* every Firestore write threw `Cannot read properties of undefined (reading
> 'serverTimestamp')`. firebase-tools wraps `firebase-admin` to point it at the local emulators, and
> the statics hanging off `admin.firestore` don't survive that wrapper — so `admin.firestore.FieldValue`
> is `undefined` in the emulator while working fine when deployed. Importing `FieldValue` from
> `firebase-admin/firestore` works in both. If you see that error in any other Firebase repo, this is
> why.

## Functions

| Function | Type | Who | Does |
|---|---|---|---|
| `submitContribution` | HTTPS (`/api/submit` via hosting rewrite) | public | Parse multipart (`meta` JSON + `audio`), validate consent (ADR-0002), store raw at `submissions/{clipId}/source.<ext>`, create `clips/{clipId}` (`pending`) + upsert `speakers/{speakerId}`. |
| `acceptClip` | Callable | reviewer | Transcode source → **24 kHz mono FLAC** (ADR-0001) at `corpus/{clipId}/audio.flac`, set `status: approved` + audio metadata. |
| `rejectClip` | Callable | reviewer | Set `status: rejected` + review notes. |

Reviewer gate: caller's auth email must be in `adminConfig/reviewers.emails` (mirrors the app's allowlist).

## Layout

```
src/index.ts            the three functions + multipart parse + reviewer gate
src/lib/validateMeta.ts consent + field validation (→ data/schema.md, ADR-0002)
src/lib/transcode.ts    ffmpeg-static → FLAC; ffprobe-static → duration
```

## Working on these functions

The project, bucket, reviewer allowlist and site wiring are all already in place — this section is
about changing the code, not standing it up.

```bash
npm install && npm run typecheck
npm run serve      # build + emulators (functions, firestore, storage) — needs JDK 21+
firebase deploy --only functions,hosting,firestore:rules,storage:rules
```

`npm run serve` starts Firestore and Storage emulators alongside functions. **Do not run the
functions emulator alone** — it would leave the emulated functions reading and writing the *live*
Firestore and the real corpus bucket.

## Verified

**In production** — `submitContribution`, `acceptClip` and `rejectClip` have all run against the
live project. The 5 approved clips carry `audio.path`, `audio.durationMs`, `sampleRate: 24000`,
`codec: flac` and `review.reviewedAt`, so the full submit → transcode → approve → publish path works.

**Locally, once (2026-07-25)** via `npm run serve` — a manual run, not an automated suite, so
treat it as a changelog entry rather than a guarantee any future change re-checks:

- ✅ `submitContribution` — multipart parse, consent validation, raw upload to
  `submissions/{clipId}/source.webm`, `clips/{clipId}` created as `pending`.
- ✅ **Speaker demographics survive a multi-clip session.** A submission that omits the
  `demographics` block leaves the speaker's stored answers untouched, so a 25-clip session no
  longer blanks them at clip 2. When the block *is* sent it is authoritative: a `null` means
  "prefer not to say" and deletes the stored value, so that option can actually retract an answer.
  `clipCount` increments correctly; `createdAt` is stamped once, on first contribution.
- ✅ **The speaker write is best-effort.** It runs after the clip is durable, so a transaction
  failure logs and still returns 200 rather than prompting a re-record that would duplicate the take.
- ✅ **Transcode/probe** — a 9 s Opus/WebM take → `flac / 24000 Hz / 1 ch / 16-bit` and
  `durationMs: 9000`, matching [ADR-0001](../docs/adr/0001-canonical-audio-format.md).

## Known TODOs / caveats

- **`acceptClip` / `rejectClip` have no *local* coverage.** Both are `onCall` behind
  `assertReviewer`, so exercising them in the emulator needs the Auth emulator to mint a reviewer
  token. They are proven in production, but a regression would not be caught before deploy.
- **Bucket name** is the project default; set explicitly for the isolated open-corpus bucket.
- **Rate limiting / abuse**: `submitContribution` is public. Add App Check / a rate limit before launch.
- **Source retention**: rejected clips keep their `submissions/` source; add a cleanup policy.
