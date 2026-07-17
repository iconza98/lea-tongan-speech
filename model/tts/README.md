# model/tts

Tongan TTS: a **ZONOS2** (Apache-2.0) fine-tune, served over the stable contract the app consumes
(`POST {text, speaker_audio, seed} → mp3`). Byte-level, no phonemizer — which sidesteps the fact that
eSpeak-ng has no Tongan.

## Tier-0 gate — the ZONOS2 zero-shot probe (do this first)

`probe_zonos2.py` is the **go/no-go**: voice-clone one native clip, synthesize a Tongan gold-set with
ZONOS2 zero-shot, and have a native speaker score the output (especially the ʻokina glottal stop and
macron vowel length). If zero-shot can't approximate Tongan, no fine-tune dataset is worth building yet.

```bash
# No GPU — sanity-check the gold-set anywhere:
python probe_zonos2.py --dry-run

# Real run (NVIDIA GPU / Colab, Linux x86_64 + CUDA):
git clone https://github.com/Zyphra/ZONOS2.git && cd ZONOS2 && uv sync
uv run python /path/to/probe_zonos2.py --ref <native_reference.wav> --gold-set <gold-set.json>
```

- **Reference clip:** a few seconds of ONE clean native speaker — e.g. an approved clip from the
  corpus bucket (`gs://lea-tongan-speech-corpus/corpus/<clipId>/audio.flac`) or a fresh recording.
- **Gold-set:** real gold-sets (UCLA/NCEA-derived) are **eval-only and git-ignored**
  (see [`../g2p/ATTRIBUTION.md`](../g2p/ATTRIBUTION.md)). `sample-gold-set.example.json` (own-authored,
  4 words) ships only so `--dry-run` works.

> ⚠️ **Not run yet** — needs a GPU + a Hugging Face account (to pull `Zyphra/ZONOS2`). Untested here.

## After the gate passes

1. **Fine-tune** ZONOS2 on the consented single-/multi-speaker corpus.
2. **Publish** weights + model card to Hugging Face (Apache-2.0; commercial fine-tune permitted).
3. **Serve** via Modal behind the stable `POST {text, speaker_audio, seed} → mp3` contract.
4. **Evaluate** with [`../../eval`](../../eval); publish the scorecard to the leaderboard.
