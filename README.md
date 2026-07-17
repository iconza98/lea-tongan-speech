# Lea Tongan Speech

**Malō e lelei.** An open, community-built speech corpus and set of models for the
Tongan language (lea faka-Tonga) — a language under-served by mainstream speech technology.

One community-contributed corpus feeds a family of models:

- **Text-to-speech (TTS)** — read Tongan text aloud
- **Speech-to-text (STT/ASR)** — turn spoken Tongan into written Tongan
- **Tongan → English translation**

> **Status: early scaffold.** Structure and licensing are in place; the contribution
> site, corpus, eval harness, and models are being built. See `docs/` for the design.

## Licensing (dual)

| What | Licence | File |
|------|---------|------|
| **Code** in this repo (site, functions, model tooling, eval) | **Apache-2.0** | [`LICENSE`](./LICENSE) |
| **The voice dataset** (recordings, transcripts, glosses, metadata) | **CC BY 4.0** | [`DATASET_LICENSE`](./DATASET_LICENSE) |

Every recording is contributed under an explicit, plain-language open-license consent —
see [`docs/CONSENT.md`](./docs/CONSENT.md). The corpus is **multi-speaker** and grows only
through that consented contribution flow.

**Reference data is not redistributed.** UCLA and NCEA Tongan corpora are used for
**evaluation only** (they are CC BY-NC / BY-NC-SA); their audio is never committed here and
never used as training data, so the models stay commercially usable.

The TTS model fine-tunes **ZONOS2** (Apache-2.0) and STT fine-tunes **Whisper** (MIT) — both
permit commercial fine-tuning and redistribution. See [`NOTICE`](./NOTICE).

## Repository layout

```
site/       Public website — Contribute your voice · Dataset browser/download · Eval leaderboard
functions/  Backend — audio accept + transcode + human moderation gate (own Firebase project)
model/
  tts/      ZONOS2 fine-tune + serving (Modal)
  stt/      Whisper fine-tune (later)
  g2p/      Tongan grapheme-to-phoneme (ʻokina/macron aware)
eval/       Automated harness — CER (via Whisper) · speaker similarity · G2P coverage → scorecards
data/       Corpus schema + fetch scripts for eval gold-sets (NO audio committed)
docs/       Design, consent, corpus schema, ADRs
```

## Infrastructure

Firebase project `lea-tongan-speech`. **Data** (Firestore + the `lea-tongan-speech-corpus` bucket)
lives in **australia-southeast1 (Sydney)**, near the contributor community; **Cloud Functions** run in
**us-west1 (Oregon)**, near the US model/tooling ecosystem. This deliberate data/compute split is
recorded in [`docs/adr/0003`](./docs/adr/0003-region-strategy.md). The site is served from Firebase
Hosting at https://lea-tongan-speech.web.app.

## Relationship to the Lea Fakatonga app

This project is a standalone spin-out. The app talks to the model through a single stable
contract — `POST {text, speaker_audio, seed} → mp3` — so the app can adopt an improved model
by pointing its endpoint config here, with no code sync between the two.

## Contributing

Voice contributions happen through the website (with consent). Code contributions are welcome
by pull request — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). Please never commit audio,
secrets, or model weights (see [`.gitignore`](./.gitignore)).
