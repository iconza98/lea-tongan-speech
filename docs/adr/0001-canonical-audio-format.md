# 0001 — Canonical corpus audio format: 24 kHz mono FLAC

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

The corpus feeds two model families with different sample-rate expectations:

- **STT (Whisper)** operates at **16 kHz** mono.
- **TTS (ZONOS2)** works at **22.05–24 kHz**.

We need one canonical format for the stored and published clips. Contributions arrive from the
browser recorder as lossy **Opus/WebM** (whatever `MediaRecorder` produces). The choice is
hard-to-reverse: it's baked into every published release, and re-mastering after the fact means
re-collecting or up-converting (which can't recover lost quality). So it needs a decision now, not
a default.

Competing pressures:

- **Fidelity for training** — lossy artifacts in the *canonical* master compound through resampling
  and degrade both TTS naturalness and ASR accuracy.
- **One master, two consumers** — Whisper and ZONOS2 want different rates; we don't want two
  divergent masters to keep in sync.
- **Size** — the dataset is downloaded publicly; storage and bandwidth scale with the corpus.

## Decision

Store and publish every canonical clip as:

> **FLAC, mono, 24 kHz, 16-bit.**

- The accept/transcode Cloud Function writes `corpus/{clipId}/audio.flac` at this spec after review.
- The original upload is retained as-is (Opus/WebM) at `submissions/{clipId}/source.<ext>` until
  transcode; it is **not** part of the published dataset.
- Consumers **resample at training time**: downsample to 16 kHz for Whisper, use 24 kHz (or resample
  to 22.05 kHz) for ZONOS2.

## Consequences

**Positive**
- **Lossless master** — no lossy artifacts baked into the training data.
- **Resamples cleanly to both targets** — 24 kHz → 16 kHz and → 22.05 kHz are clean downsamples; one
  master serves both model families with no second copy to maintain.
- **Speech-appropriate** — 24 kHz captures energy up to 12 kHz, well above the range that matters for
  intelligible speech; higher rates would mostly add size, not quality.
- **Ecosystem-friendly** — FLAC is natively supported by Hugging Face `datasets` and common audio
  tooling (soundfile/torchaudio/ffmpeg).

**Negative / trade-offs accepted**
- **Larger than mp3** — FLAC is lossless, so files are bigger than a lossy delivery format. Acceptable:
  this is a *training* corpus, not an app-delivery asset. (The app deliberately uses mp3 for playback —
  a different goal: delivery, not training.)
- **Not future-proofed to 48 kHz** — if a future model wants full-band 48 kHz audio, new contributions
  would need re-recording. Judged not worth the ~2× size now, since no current or planned model needs it
  and speech content above 12 kHz is negligible.

## Alternatives considered

| Option | Why not |
|---|---|
| **mp3 / Opus (lossy) canonical** | Smaller, but lossy artifacts in the master degrade training and compound through resampling. Fine for app *delivery*, not for a training corpus. |
| **16 kHz canonical** | Matches Whisper exactly, but permanently caps TTS fidelity — ZONOS2 output would be stuck at telephone-ish bandwidth. Throwing away fidelity at the master is irreversible. |
| **48 kHz canonical** | Future-proof and highest quality, but ~2× the size for content speech doesn't use. Over-provisioning a public download for no model that needs it. |
| **Two masters (16 kHz for STT + 24 kHz for TTS)** | Doubles storage and invites drift between two "truths" for the same clip. A single high-quality master resampled on demand is simpler and safer. |
