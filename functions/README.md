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

## Before it can run (needs the Firebase project)

1. Create the isolated Firebase project; copy `.firebaserc.example` → `.firebaserc` with its id.
2. Set the open-corpus bucket in `src/index.ts` (`admin.storage().bucket(<name>)`) if not the default.
3. Seed `adminConfig/reviewers` `{ emails: [...] }`.
4. `npm install && npm run typecheck`, then `npm run serve` (emulators) to exercise the flow.
5. Deploy: `firebase deploy --only functions,hosting,firestore:rules,storage:rules`.
6. Point the site at it: `site/config.js` → `submitEndpoint: "/api/submit"`.

## Verified

**In production** — `submitContribution`, `acceptClip` and `rejectClip` have all run against the
live project. The 5 approved clips carry `audio.path`, `audio.durationMs`, `sampleRate: 24000`,
`codec: flac` and `review.reviewedAt`, so the full submit → transcode → approve → publish path works.

**Locally**, with `firebase emulators:start --only functions,firestore,storage --project demo-lts`
(needs **JDK 21+** — firebase-tools rejects older Java):

- ✅ `submitContribution` — multipart parse, consent validation, raw upload to
  `submissions/{clipId}/source.webm`, `clips/{clipId}` created as `pending`.
- ✅ **Speaker demographics survive a multi-clip session.** Submissions 2+ carry
  `{island:null, ageBand:null, gender:null}`; nulls are stripped before the merge so they no longer
  overwrite the answers given on clip 1. `clipCount` increments correctly; `createdAt` is stamped
  once, on first contribution.
- ✅ **Transcode/probe** — a 9 s Opus/WebM take → `flac / 24000 Hz / 1 ch / 16-bit` and
  `durationMs: 9000`, matching [ADR-0001](../docs/adr/0001-canonical-audio-format.md).

## Known TODOs / caveats

- **`acceptClip` / `rejectClip` have no *local* coverage.** Both are `onCall` behind
  `assertReviewer`, so exercising them in the emulator needs the Auth emulator to mint a reviewer
  token. They are proven in production, but a regression would not be caught before deploy.
- **Bucket name** is the project default; set explicitly for the isolated open-corpus bucket.
- **Rate limiting / abuse**: `submitContribution` is public. Add App Check / a rate limit before launch.
- **Source retention**: rejected clips keep their `submissions/` source; add a cleanup policy.
