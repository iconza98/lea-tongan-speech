"""Eval metrics for the Tongan speech models.

Only `g2p_coverage` runs today (it needs just the G2P). The audio-dependent metrics — CER (via an
ASR pass), speaker similarity, and MOS — are stubs until a model produces audio to score; they return
None so a scorecard can still be assembled with the metrics that ARE available.
"""
from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model", "g2p"))
from ton_g2p import g2p, OKINA, LENGTH  # noqa: E402

MACRONS = set("āēīōū")


def g2p_coverage(words: list[str]) -> dict:
    """Fraction of ʻokina words that emit /ʔ/ and macron words that emit /Vː/ — the phonemic features
    that mainstream phonemizers drop. A property of the G2P over a given word/transcript list."""
    okina_total = okina_ok = macron_total = macron_ok = 0
    for w in words:
        got = g2p(w)
        if OKINA in w:
            okina_total += 1
            okina_ok += "ʔ" in got
        if any(c in MACRONS for c in w):
            macron_total += 1
            macron_ok += LENGTH in got
    return {
        "okina": {"ok": okina_ok, "total": okina_total, "rate": _rate(okina_ok, okina_total)},
        "macron": {"ok": macron_ok, "total": macron_total, "rate": _rate(macron_ok, macron_total)},
    }


def cer(references: list[str], hypotheses: list[str]) -> float | None:
    """Character error rate of an ASR transcription of synthesized speech vs the reference text.
    STUB — needs a Whisper pass over model audio. Returns None until a model exists."""
    return None


def speaker_similarity(reference_audio: str, synthesized_audio: str) -> float | None:
    """Voice-cloning fidelity (speaker-embedding cosine). STUB — needs model audio. Returns None."""
    return None


def mos(ratings: list[float]) -> float | None:
    """Mean Opinion Score from community listening tests. STUB — no ratings yet. Returns None."""
    return round(sum(ratings) / len(ratings), 3) if ratings else None


def _rate(ok: int, total: int) -> float | None:
    return round(ok / total, 4) if total else None
