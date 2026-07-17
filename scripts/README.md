# scripts/

Operational scripts. All authenticate with **gcloud owner credentials**
(`gcloud auth print-access-token`) and use the Firestore/Storage REST APIs — no service-account key.

| Script | Does |
|---|---|
| `seed-prompts.mjs` | Upsert `prompts` from a JSONL file (default `data/seed-prompts.example.jsonl`). |
| `publish-scorecard.mjs` | Run `eval/run.py` for a model and upsert the scorecard to `evalRuns/{model}-{date}` (feeds the leaderboard). |
| `export-dataset.mjs` | Export a CC BY 4.0 release from **approved** clips → `dist/lea-tongan-speech-<version>/` (FLACs + `metadata.jsonl` + `speakers.jsonl` + README + LICENSE), Hugging Face audio-folder-friendly. |

```bash
node scripts/seed-prompts.mjs
node scripts/publish-scorecard.mjs --model baseline-g2p
node scripts/export-dataset.mjs --version 2026.1
```

`dist/` is git-ignored — releases are published to Hugging Face / storage, not committed.
