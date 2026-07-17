# functions/

Accept/transcode + moderation pipeline (Cloud Functions, TypeScript, Node 22) for the open corpus.
Own Firebase project, isolated from the app.

> ⚠️ **Untested skeleton.** Written before the Firebase project exists — it is shaped to compile and
> follows the app's proven accept pattern, but has not been deployed or run. Validate before trusting.

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

## Known TODOs / caveats

- **Untested** — no deploy or emulator run yet; typecheck once deps install.
- **Bucket name** is the project default; set explicitly for the isolated open-corpus bucket.
- **Rate limiting / abuse**: `submitContribution` is public. Add App Check / a rate limit before launch.
- **Source retention**: rejected clips keep their `submissions/` source; add a cleanup policy.
