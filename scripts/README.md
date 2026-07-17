# scripts/

Operational scripts. All authenticate with **gcloud owner credentials**
(`gcloud auth print-access-token`) and use the Firestore/Storage REST APIs — no service-account key.

| Script | Does |
|---|---|
| `seed-prompts.mjs` | Upsert `prompts` from a JSONL file (default `data/seed-prompts.example.jsonl`). |
| `publish-scorecard.mjs` | Run `eval/run.py` for a model and upsert the scorecard to `evalRuns/{model}-{date}` (feeds the leaderboard). |
| `export-dataset.mjs` | Export a CC BY 4.0 release from **approved** clips → `dist/lea-tongan-speech-<version>/` (FLACs + `metadata.jsonl` + `speakers.jsonl` + README + LICENSE), Hugging Face audio-folder-friendly. |
| `reviewers.mjs` | List/add/remove reviewer emails on the `adminConfig/reviewers` allowlist that `assertReviewer` checks (see [`docs/reviewing.md`](../docs/reviewing.md)). |

```bash
node scripts/seed-prompts.mjs
node scripts/publish-scorecard.mjs --model baseline-g2p
node scripts/export-dataset.mjs --version 2026.1
node scripts/reviewers.mjs list
node scripts/reviewers.mjs add reviewer@example.com
```

`dist/` is git-ignored — releases are published to Hugging Face / storage, not committed.
