#!/usr/bin/env python3
"""Assemble an eval scorecard for the leaderboard.

Today it fills the G2P-coverage metric (runnable now) and leaves the audio-dependent metrics null.
As models arrive, wire their audio into cer()/speaker_similarity()/mos() in metrics.py.

Usage:
    python eval/run.py --model baseline-g2p --words eval/sample-words.txt
    python eval/run.py --model zonos2-ft-v1                       # defaults to sample words
Scorecards are printed as JSON and (with --out) written under eval/runs/ (git-ignored).
"""
from __future__ import annotations
import argparse
import datetime
import json
import os

from metrics import g2p_coverage, cer, speaker_similarity, mos

HERE = os.path.dirname(os.path.abspath(__file__))


def load_words(path: str | None) -> list[str]:
    path = path or os.path.join(HERE, "sample-words.txt")
    with open(path, encoding="utf-8") as fh:
        return [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]


def build_scorecard(model: str, words: list[str]) -> dict:
    return {
        "model": model,
        "date": datetime.date.today().isoformat(),
        "n_words": len(words),
        "metrics": {
            "g2p_coverage": g2p_coverage(words),          # available now
            "cer": cer([], []),                           # None until a model exists
            "speaker_similarity": speaker_similarity("", ""),
            "mos": mos([]),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="model id/name for the scorecard")
    ap.add_argument("--words", help="word/transcript list (one per line); defaults to sample-words.txt")
    ap.add_argument("--out", action="store_true", help="also write to eval/runs/<model>-<date>.json")
    args = ap.parse_args()

    card = build_scorecard(args.model, load_words(args.words))
    print(json.dumps(card, ensure_ascii=False, indent=2))

    if args.out:
        runs = os.path.join(HERE, "runs")
        os.makedirs(runs, exist_ok=True)
        dest = os.path.join(runs, f"{args.model}-{card['date']}.json")
        with open(dest, "w", encoding="utf-8") as fh:
            json.dump(card, fh, ensure_ascii=False, indent=2)
        print(f"\nwrote {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
