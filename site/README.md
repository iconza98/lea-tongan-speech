# site/

Public website (Firebase Hosting). The site root (`index.html`) is the **landing page** — a
mission-driven intro that funnels visitors into the contribute tool (`contribute.html`), which
hosts three surfaces:

- **Contribute** — record → consent ([`../docs/CONSENT.md`](../docs/CONSENT.md)) → grant CC BY 4.0 →
  submit. **Live.** Uploads to the `submitContribution` Cloud Function via the `/api/submit` hosting
  rewrite; clips land as `pending` for review. Contributors work in **sessions** of `sessionSize`
  prompts so progress reads as finishable rather than against the whole corpus. Setting
  `submitEndpoint: null` in `config.js` forces the old stub mode (payload logged, nothing uploaded).
- **Dataset** — browse/download the published CC BY 4.0 corpus. *Stub (needs the export + backend).*
- **Leaderboard** — model scorecards from `eval/`. *Stub (needs models).*

A separate **Reviewer** page (`review.html`) lets allowlisted reviewers approve/reject clips.

## Files

| File | Role |
|---|---|
| `index.html` | landing page (mission intro + TikTok, CTAs → `contribute.html`) |
| `contribute.html` | the contribute tool — markup + the three views (Contribute / Dataset / Leaderboard) |
| `review.html` | reviewer sign-in + moderation queue (`review.js`) |
| `styles.css` | styling (Lea Fakatonga brand — shared by all pages) |
| `app.js` | recorder (MediaRecorder), consent gate, demographics, submit |
| `config.js` | **public** runtime config — `submitEndpoint` (null = stub), `consentVersion`, prompts URL, `maxRecordSeconds`, `sessionSize` |
| `session.js` | pure session arithmetic (which screen, progress label) — no DOM, so it is testable |
| `test-session.mjs` | `node site/test-session.mjs` — dependency-free tests for `session.js`, run in CI |
| `prompts.sample.json` | seed prompts to read (Tongan + English) |

## Run locally

MediaRecorder + `fetch` need a real origin, so serve over http (not `file://`):

```bash
cd site && python3 -m http.server 8000    # then open http://localhost:8000
```

Grant microphone access. Served this way the page has no backend, so set `submitEndpoint: null` to
exercise the flow in stub mode and watch the assembled payload in the console.

```bash
node site/test-session.mjs      # session logic (no browser, no dependencies)
```

## How a submission travels

The site POSTs `multipart/form-data` with `meta` (JSON, per [`../data/schema.md`](../data/schema.md))
+ `audio` to `/api/submit`, which `firebase.json` rewrites to the `submitContribution` function. That
stores the raw upload, writes a `pending` clip doc, and routes it to the reviewer gate
(`review.html`); approval transcodes to canonical 24 kHz mono FLAC
([`../docs/adr/0001`](../docs/adr/0001-canonical-audio-format.md)).

> **`prompts.sample.json` is published to real contributors** — this page auto-deploys to production
> on merge to `main`. Anything added here is read aloud and recorded into a permanent CC BY 4.0
> dataset, so prompt text must clear [`../docs/adr/0005`](../docs/adr/0005-prompt-text-provenance.md)
> first (`node scripts/check-prompts.mjs`).
