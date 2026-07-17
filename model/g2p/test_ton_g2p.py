#!/usr/bin/env python3
"""
test_ton_g2p.py — regression tests for ton_g2p.py.

Dependency-free: runs as a plain script (`python model/g2p/test_ton_g2p.py`, non-zero exit on
failure) AND is discoverable by pytest (the `test_*` functions assert).

Three layers:

  1. INLINE HARD GATES (self-contained, always run) — every ʻokina word must emit /ʔ/ and every
     macron word must emit a long vowel /Vː/. This is exactly what the Māori-proxy phonemizer
     failed, so it is the gate that matters, and it uses only our own hand-authored words.
  2. CONNECTED-SPEECH REGRESSION (self-contained, always run) — definitive-accent (toloi) fixtures
     and un-accented citation forms, with HAND-VERIFIED IPA targets independent of g2p's own output.
  3. UCLA ARCHIVE REGRESSION (optional) — if a local `ucla-lexicon.json` is present, regress g2p
     against the archive's IPA. The UCLA data is CC BY-NC-SA (reference/eval ONLY, NOT redistributed
     — it is git-ignored and never committed). If the file is absent, this layer is SKIPPED, never
     failed. See ATTRIBUTION.md.
"""
from __future__ import annotations
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ton_g2p import g2p, phonemicize, flag_missing_definitive, OKINA, LENGTH, STRESS  # noqa: E402

MACRONS = set("āēīōū")

# ── Layer 1: inline hard gates (our own words, no external data) ──────────────
OKINA_WORDS = ["ʻufi", "ʻako", "ʻofa", "ʻeiki", "taʻu", "lavameʻa", "motuʻa", "faʻā"]
MACRON_WORDS = ["kumā", "mālō", "mālohi", "Tōnga", "fēfē", "kikī", "māfana", "vākai"]

# ── Layer 2: connected-speech regression (hand-verified targets) ─────────────
# Definitive-accent (toloi) words: the acute moves primary stress to the final mora and lengthens it.
DEFINITIVE_FIXTURES = [
    ("mamí", "maˈmiː"),        # mum (def.)   — cf. citation mami
    ("akó", "aˈkoː"),          # the school   — cf. citation ʻako → ˈʔako
    ("kulí", "kuˈliː"),        # the dog
    ("Lōpiní", "loːpiˈniː"),   # Robin (def.) — macron + final acute
    ("māfaná", "maːfaˈnaː"),   # the warm (time)
    ("fonuá", "fonuˈaː"),      # the country  — cf. citation fonua → foˈnua
    ("sipotí", "sipoˈtiː"),    # the sport
    ("lavameʻá", "lavameˈʔaː"),# the success  — accent after ʻokina syllable
    ("kulií", "kuˈliː"),       # doubled-vowel spelling of kulī + acute
]
# Un-accented citation forms that MUST be untouched by the definitive-accent logic.
CITATION_REGRESSION = [
    ("ʻako", "ˈʔako"), ("fale", "ˈfale"), ("kulī", "kuˈliː"), ("fonua", "foˈnua"),
    ("mami", "ˈmami"), ("kumā", "kuˈmaː"), ("ʻufi", "ˈʔufi"), ("mālō", "maːˈloː"),
]

LEXICON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ucla-lexicon.json")


def pct(a: int, b: int) -> str:
    return f"{100*a/b:.1f}%" if b else "n/a"


# ─── Layer 1 ──────────────────────────────────────────────────────────────────
def check_inline_gates() -> bool:
    print("─" * 72)
    print("Inline hard gates (ʻokina → /ʔ/, macron → /Vː/)")
    print("─" * 72)
    ok = True
    for w in OKINA_WORDS:
        got = g2p(w)
        good = "ʔ" in got
        ok = ok and good
        print(f"  {'✓' if good else '✗'} ʻokina  {w:<12} g2p={got}")
    for w in MACRON_WORDS:
        got = g2p(w)
        good = LENGTH in got
        ok = ok and good
        print(f"  {'✓' if good else '✗'} macron  {w:<12} g2p={got}")
    print("\n" + ("✅ INLINE GATES PASSED" if ok else "❌ INLINE GATES FAILED"))
    return ok


# ─── Layer 2 ──────────────────────────────────────────────────────────────────
def check_connected() -> bool:
    print("\n" + "─" * 72)
    print("Connected-speech regression (definitive accent)")
    print("─" * 72)
    ok = True

    def check(word: str, want: str, kind: str) -> None:
        nonlocal ok
        got = g2p(word)
        if got != want:
            ok = False
        print(f"  {'✓' if got == want else '✗'} {kind:9} {word:<12} g2p={got:<14} want={want}")

    for w, want in DEFINITIVE_FIXTURES:
        check(w, want, "definitive")
    for w, want in CITATION_REGRESSION:
        check(w, want, "citation")

    for w, _ in DEFINITIVE_FIXTURES:  # every definitive fixture must stress a LONG final vowel
        got = g2p(w)
        if not got.endswith(LENGTH) or STRESS not in got:
            ok = False
            print(f"  ✗ gate      {w}: expected stressed long final vowel, got {got}")

    flags = flag_missing_definitive("ʻoku ʻofa ai e tokotaha kotoa")
    print(f"  · flag_missing_definitive demo → {[f['word'] for f in flags]}")
    print("\n" + ("✅ CONNECTED REGRESSION PASSED" if ok else "❌ CONNECTED REGRESSION FAILED"))
    return ok


# ─── Layer 3 (optional) ─────────────────────────────────────────────────────
def check_ucla_regression() -> bool | None:
    """Regress against the UCLA archive IPA if the (git-ignored) lexicon is present. Returns
    True/False if run, or None if skipped (lexicon not present — reference-only, not redistributed)."""
    if not os.path.exists(LEXICON):
        print("\n" + "─" * 72)
        print("UCLA archive regression: SKIPPED — ucla-lexicon.json not present.")
        print("  (UCLA data is CC BY-NC-SA: reference/eval only, never committed. See ATTRIBUTION.md.)")
        print("─" * 72)
        return None
    with open(LEXICON, encoding="utf-8") as fh:
        lex = json.load(fh)
    okina_total = okina_ok = macron_total = macron_ok = 0
    for e in lex["entries"]:
        word, ipa = e["tonganWord"], e.get("ipa", "")
        if not ipa:
            continue
        got = g2p(word)
        if OKINA in word:
            okina_total += 1
            okina_ok += "ʔ" in got
        if any(ch in MACRONS for ch in word):
            macron_total += 1
            macron_ok += LENGTH in got
    print("\n" + "─" * 72)
    print("UCLA archive regression (reference-only)")
    print(f"  ʻOKINA → /ʔ/ : {okina_ok}/{okina_total} ({pct(okina_ok, okina_total)})")
    print(f"  MACRON → /Vː/: {macron_ok}/{macron_total} ({pct(macron_ok, macron_total)})")
    gate_ok = okina_ok == okina_total and macron_ok == macron_total
    print(("✅ UCLA GATES PASSED" if gate_ok else "❌ UCLA GATE FAILED"))
    return gate_ok


# ─── pytest entry points (self-contained layers only) ────────────────────────
def test_inline_gates():
    assert check_inline_gates()


def test_connected():
    assert check_connected()


def test_ucla_regression_if_present():
    result = check_ucla_regression()
    assert result is not False  # pass when True or skipped (None)


def main() -> int:
    ok = check_inline_gates()
    ok = check_connected() and ok
    ucla = check_ucla_regression()
    if ucla is False:
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
