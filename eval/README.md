# eval/

Evaluation harness → versioned scorecards for the leaderboard.

## Runnable now

- `metrics.py` — `g2p_coverage(words)` computes ʻokina → /ʔ/ and macron → /Vː/ coverage using the
  ported [`../model/g2p`](../model/g2p). This is the feature mainstream phonemizers drop.
- `run.py` — assembles a scorecard JSON. Fills G2P coverage today; leaves audio metrics null.

```bash
python eval/run.py --model baseline-g2p --words eval/sample-words.txt
python eval/run.py --model zonos2-ft-v1 --out      # writes eval/runs/<model>-<date>.json (git-ignored)
```

## Stubs (until a model produces audio)

`cer` (character error rate via a Whisper pass over synthesized speech), `speaker_similarity`
(voice-clone fidelity), and `mos` (community listening tests) return `None` in `metrics.py` and are
wired in as models arrive.

## Gold-sets

CER/coverage against reference gold-sets uses UCLA / NCEA data, which is **referenced, not
redistributed** — CC BY-NC / BY-NC-SA, git-ignored, eval-only. Fetch scripts belong in
[`../data`](../data); see [`../model/g2p/ATTRIBUTION.md`](../model/g2p/ATTRIBUTION.md).

## Leaderboard

`site/` renders scorecards over time. Once the Firebase project exists, `run.py --out` scorecards are
published to `evalRuns/{runId}` for the leaderboard to read.
