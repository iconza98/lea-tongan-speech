# functions/

Accept/transcode + moderation pipeline (Cloud Functions, TypeScript, Node 22) for the open corpus.
Own Firebase project, isolated from the app.

> **Partly verified (2026-07-25).** `submitContribution` and the transcode/probe stage have now been
> run against the Firebase emulator suite (`functions,firestore,storage`) — see *Verified so far*
> below. Still **not deployed**, and the two reviewer callables remain unexercised.
>
> That emulator run caught a bug the "untested" label had been hiding: **every Firestore write threw
> at runtime.** `admin.firestore.FieldValue` is `undefined` under `esModuleInterop`, because
> `import * as admin` compiles to a namespace copy (`__importStar`) that loses the statics attached
> to `admin.firestore`. Typecheck passes regardless — TS sees the types, not the runtime shape.
> Fixed by importing `FieldValue` from `firebase-admin/firestore`. Treat "it compiles" as no evidence
> at all for this file.

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

## Verified so far

Run with `firebase emulators:start --only functions,firestore,storage --project demo-lts`
(needs **JDK 21+** — firebase-tools rejects older Java).

- ✅ `submitContribution` — multipart parse, consent validation, raw upload to
  `submissions/{clipId}/source.webm`, `clips/{clipId}` created as `pending`.
- ✅ **Speaker demographics survive a multi-clip session.** Submissions 2+ carry
  `{island:null, ageBand:null, gender:null}`; nulls are stripped before the merge so they no longer
  overwrite the answers given on clip 1. `clipCount` increments correctly; `createdAt` is stamped
  once, on first contribution.
- ✅ **Transcode/probe** — a 9 s Opus/WebM take → `flac / 24000 Hz / 1 ch / 16-bit` and
  `durationMs: 9000`, matching [ADR-0001](../docs/adr/0001-canonical-audio-format.md).

## Known TODOs / caveats

- **`acceptClip` / `rejectClip` are still unexercised** — both are `onCall` behind `assertReviewer`,
  which needs a real Firebase ID token. The transcode stage they depend on is verified separately
  (above), but the callables themselves, the reviewer gate, and the `corpus/` write are not.
- **Not deployed** — everything above is emulator-only.
- **Bucket name** is the project default; set explicitly for the isolated open-corpus bucket.
- **Rate limiting / abuse**: `submitContribution` is public. Add App Check / a rate limit before launch.
- **Source retention**: rejected clips keep their `submissions/` source; add a cleanup policy.
