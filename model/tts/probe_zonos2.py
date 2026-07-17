#!/usr/bin/env python3
"""
probe_zonos2.py — ZONOS2 zero-shot probe over a Tongan gold-set (the Tier-0 go/no-go gate).

Synthesizes every item in a gold-set with ZONOS2 (byte-level, no phonemizer), voice-cloned from one
native reference clip, and writes samples/<slug>.wav + a zip for a listening review. A native speaker
then scores the output against each item's IPA target. This is the decision point: if zero-shot can't
approximate Tongan (especially the ʻokina glottal stop and macron vowel length), no fine-tune dataset
is worth building yet.

────────────────────────────────────────────────────────────────────────────────────────────
WHERE THIS RUNS — ZONOS2 needs an NVIDIA GPU (Linux x86_64 + CUDA). It does NOT run on a Mac or in
a sandbox. Use Google Colab (GPU runtime) or any CUDA box. `--dry-run` needs no GPU and just lists
the gold-set (use it to sanity-check the data on any machine).

EXPECTATION — Tongan is out-of-distribution for ZONOS2 (not in its supported language tiers). The
gold-set measures *how* it fails; do not expect it to pass unreviewed. That is the point of the gate.
────────────────────────────────────────────────────────────────────────────────────────────

Setup (on a CUDA machine / Colab):
    git clone https://github.com/Zyphra/ZONOS2.git && cd ZONOS2 && uv sync
    uv run python /path/to/probe_zonos2.py --ref <native_reference.wav> --gold-set <gold-set.json>

The reference clip is a few seconds of ONE clean native Tongan speaker — e.g. an approved clip from
the corpus bucket (gs://lea-tongan-speech-corpus/corpus/<clipId>/audio.flac) or a fresh recording.
Real gold-sets (UCLA/NCEA-derived) are eval-only and git-ignored; see model/g2p/ATTRIBUTION.md. A
tiny own-authored example ships as sample-gold-set.example.json for --dry-run.
"""
from __future__ import annotations
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ZONOS2 zero-shot probe over a Tongan gold-set")
    p.add_argument("--ref", default=None, help="native Tongan reference clip (wav/mp3) to voice-clone")
    p.add_argument("--gold-set", default=os.path.join(HERE, "sample-gold-set.example.json"),
                   help="gold-set JSON with `words` or `sentences` (each item: slug/tongan/ipa)")
    p.add_argument("--dry-run", action="store_true", help="list items and exit (no GPU / ZONOS2 needed)")
    p.add_argument("--out", default=os.path.join(HERE, "samples"))
    p.add_argument("--zip", default=os.path.join(HERE, "tongan_samples.zip"))
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--model", default="Zyphra/ZONOS2")
    p.add_argument("--accurate", action="store_true", default=True,
                   help="accurate mode (closer voice match); pass --expressive for the other mode")
    p.add_argument("--expressive", dest="accurate", action="store_false")
    return p.parse_args()


def load_items(gold_set_path: str) -> tuple[list, bool]:
    """Load a gold-set. Returns (items, is_sentences). Accepts a word-level set (`words`) or a
    connected-speech set (`sentences`) — both carry `tongan`/`slug`/`ipa`."""
    with open(gold_set_path, encoding="utf-8") as fh:
        gold = json.load(fh)
    is_sentences = "sentences" in gold and "words" not in gold
    items = gold.get("words") or gold.get("sentences") or []
    return items, is_sentences


def main() -> int:
    args = parse_args()

    # Load the gold-set BEFORE the GPU-only import, so --dry-run / --help need no GPU/ZONOS2.
    items, is_sentences = load_items(args.gold_set)
    kind = "sentences" if is_sentences else "words"
    print(f"Loaded {len(items)} gold-set {kind} from {os.path.relpath(args.gold_set)}")

    if args.dry_run:
        for i, w in enumerate(items, 1):
            print(f"  [{i:>2}/{len(items)}] {w['slug']:<18} {w['tongan']:<40} /{w.get('ipa', '?')}/")
        print("\n(dry run — no synthesis. Run on a GPU and have a native speaker score the output.)")
        return 0

    if not args.ref:
        sys.exit("--ref is required for a real run (a native Tongan reference clip to voice-clone).")

    # Imported here (not at top) so --help / --dry-run work without the GPU-only package installed.
    try:
        from zonos2.message import TTSSamplingParams
        from zonos2.tts import TTSLLM
    except ImportError:
        sys.exit(
            "ZONOS2 is not installed. This probe needs a CUDA GPU + the ZONOS2 package:\n"
            "    git clone https://github.com/Zyphra/ZONOS2.git && cd ZONOS2 && uv sync\n"
            "then run with `uv run python`. (For a no-GPU check of the gold-set, add --dry-run.)"
        )

    print(f"Model: {args.model} · byte-level (text_normalization=False) · "
          f"{'accurate' if args.accurate else 'expressive'} mode · seed={args.seed}")
    print("NOTE: Tongan is out-of-distribution for ZONOS2 — this measures failure modes.\n")

    os.makedirs(args.out, exist_ok=True)
    tts = TTSLLM(model_path=args.model)
    emb = tts.embed_speaker_file(args.ref)  # ECAPA-TDNN speaker embedding from the reference clip

    for i, w in enumerate(items, 1):
        text, slug = w["tongan"], w["slug"]
        result = tts.generate_one(
            text,
            TTSSamplingParams(seed=args.seed),
            speaker_embedding=emb,
            text_normalization=False,  # raw UTF-8 byte tokenization; no Tongan TN exists anyway
            accurate_mode=args.accurate,
        )
        out_path = os.path.join(args.out, f"{slug}.wav")
        tts.save_audio(result["audio"], out_path)
        print(f"  [{i:>2}/{len(items)}] {slug:<18} {text:<40} /{w.get('ipa', '?')}/  → {os.path.relpath(out_path)}")

    base = args.zip[:-4] if args.zip.endswith(".zip") else args.zip
    shutil.make_archive(base, "zip", args.out)
    print(f"\n✅ Wrote {len(items)} clips to {os.path.relpath(args.out)}/ and zipped → {base}.zip")
    print("Next: have a native speaker score each clip against its IPA target (ʻokina + macron first).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
