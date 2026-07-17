# model/

Model training + serving. All three models train off the **one** consented corpus.

- [`tts/`](./tts) — **ZONOS2** (Apache-2.0) fine-tune + Modal serving. Byte-level, no phonemizer.
  Serves the stable contract `POST {text, speaker_audio, seed} → mp3` the app consumes.
  First gate: native-speaker-scored zero-shot ZONOS2 probe (go/no-go) before fine-tuning.
- [`stt/`](./stt) — **Whisper** (MIT) fine-tune for Tongan ASR. *(Later.)*
- [`g2p/`](./g2p) — Tongan grapheme-to-phoneme (ʻokina/macron aware); ported from the app's
  research `ton_g2p.py` + tests. Used by eval coverage checks.

Weights + model cards are published to **Hugging Face**, never committed here. *TBD — Phase 3.*
