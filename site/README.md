# site/

Public website (Firebase Hosting). Three surfaces:

- **Contribute** — record → consent ([`../docs/CONSENT.md`](../docs/CONSENT.md)) → grant CC BY 4.0 →
  submit. **Built** (front-end). Currently runs in **stub mode**: it captures audio, gates on the
  three consent boxes, assembles the clip payload (matching [`../data/schema.md`](../data/schema.md)),
  and — with no backend configured — logs the payload instead of uploading.
- **Dataset** — browse/download the published CC BY 4.0 corpus. *Stub (needs the export + backend).*
- **Leaderboard** — model scorecards from `eval/`. *Stub (needs models).*

## Files

| File | Role |
|---|---|
| `index.html` | markup + the three views |
| `styles.css` | styling |
| `app.js` | recorder (MediaRecorder), consent gate, demographics, submit |
| `config.js` | **public** runtime config — `submitEndpoint` (null = stub), `consentVersion`, prompts URL, max length |
| `prompts.sample.json` | seed prompts to read (Tongan + English) |

## Run locally

MediaRecorder + `fetch` need a real origin, so serve over http (not `file://`):

```bash
cd site && python3 -m http.server 8000    # then open http://localhost:8000
```

Grant microphone access. In stub mode, open the console to see the assembled payload after "Submit".

## Wiring the backend (once the Firebase project exists)

Set `config.js` → `submitEndpoint` to the accept Cloud Function URL. The site POSTs
`multipart/form-data` with `meta` (JSON, per the corpus schema) + `audio` (the recording). The
function transcodes to canonical 24 kHz mono FLAC ([`../docs/adr/0001`](../docs/adr/0001-canonical-audio-format.md)),
writes a `pending` clip doc, and routes it to the reviewer moderation gate.
