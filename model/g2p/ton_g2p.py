#!/usr/bin/env python3
"""
ton_g2p.py — a small, dependency-free grapheme-to-phoneme (G2P) converter for Tongan.

WHY THIS EXISTS
    A zero-shot TTS probe that phonemized Tongan through a Māori proxy scored 2/12, with EVERY
    ʻokina (glottal-stop) word failing — Māori has no phonemic /ʔ/. Tongan orthography is
    near-perfectly phonemic, so a correct G2P is ~a page of code, not a research problem.

DUAL USE
    1. As an EVALUATION tool: `phonemicize()` lets us score any TTS output (or a reference IPA) on a
       common phonemic footing. `test_ton_g2p.py` regression-tests this module.
    2. As a drop-in PHONEMIZER: if a phonemizer-dependent TTS fine-tune is pursued (and eSpeak-ng has
       no Tongan), `g2p()` replaces the broken Māori proxy.

TONGAN PHONOLOGY ENCODED HERE
    Consonants (12): p t k ʔ f v s h m n ŋ l   (digraph "ng" → ŋ; ʻokina U+02BB → ʔ)
    Vowels (5): a e i o u, each short or long (macron ā ē ī ō ū → long Vː)
    Stress: primary stress falls on the PENULTIMATE MORA (a long vowel = 2 morae), e.g.
        fale→ˈfale, kumā→kuˈmaː, mālohi→maːˈlohi, kikī→kiˈkiː, ʻufi→ˈʔufi.

    DEFINITIVE ACCENT / TOLOI (for connected speech)
        A phrase-final word in a definite noun phrase carries the definitive accent, written as an
        acute over the final vowel: á é í ó ú. Phonetically it moves primary stress to that final
        mora AND lengthens it. So `kulí`→kuˈliː, `akó`→ʔaˈkoː (contrast citation `ʻako`→ˈʔako).
        POLICY: honor-when-written, NEVER predict — if the acute is present we apply it; if it is
        absent we fall back to the penultimate default and do not infer definiteness from syntax.
        (`flag_missing_definitive()` separately warns about likely-missing accents; it never
        changes g2p() output.)

Usage:
    python ton_g2p.py "kumā"        # -> kuˈmaː
    from ton_g2p import g2p, phonemicize
"""
from __future__ import annotations
import re
import sys
import unicodedata

OKINA = "ʻ"  # ʻ MODIFIER LETTER TURNED COMMA — the canonical ʻokina
LENGTH = "ː"  # ː
STRESS = "ˈ"  # ˈ

CONSONANTS = {
    "p": "p", "t": "t", "k": "k", "f": "f", "v": "v",
    "s": "s", "h": "h", "m": "m", "n": "n", "l": "l",
}
# vowel grapheme -> (phoneme, is_long, is_accented)
#   plain a e i o u            → short, unaccented
#   macron ā ē ī ō ū           → long,  unaccented
#   acute  á é í ó ú (toloi)   → long,  ACCENTED (definitive accent: primary stress on this mora)
VOWELS = {
    "a": ("a", False, False), "e": ("e", False, False), "i": ("i", False, False),
    "o": ("o", False, False), "u": ("u", False, False),
    "ā": ("a", True, False), "ē": ("e", True, False), "ī": ("i", True, False),
    "ō": ("o", True, False), "ū": ("u", True, False),
    "á": ("a", True, True), "é": ("e", True, True), "í": ("i", True, True),
    "ó": ("o", True, True), "ú": ("u", True, True),
}
VOWEL_PHONEMES = set("aeiou")


def _syllabify(word: str):
    """Split one Tongan word into (onset_phoneme, vowel_phoneme, is_long, is_accented) syllables.

    A doubled identical vowel (`kulii`, `saa`) is read as one long vowel — transcripts sometimes
    spell length that way instead of with a macron; if either half carries the acute, the merged
    long vowel is accented.
    """
    sylls = []
    i, n = 0, len(word)
    while i < n:
        onset = ""
        c = word[i]
        if c == "n" and i + 1 < n and word[i + 1] == "g":  # digraph ng → ŋ
            onset, i = "ŋ", i + 2
        elif c in CONSONANTS:
            onset, i = CONSONANTS[c], i + 1
        elif c == OKINA:
            onset, i = "ʔ", i + 1  # ʔ
        # expect a vowel next
        if i < n and word[i] in VOWELS:
            base, is_long, is_acc = VOWELS[word[i]]
            i += 1
            # merge a following identical base vowel into one long vowel (doubled-vowel length)
            while i < n and word[i] in VOWELS and VOWELS[word[i]][0] == base:
                is_long = True
                is_acc = is_acc or VOWELS[word[i]][2]
                i += 1
            sylls.append((onset, base, is_long, is_acc))
        elif onset:
            sylls.append((onset, "", False, False))  # consonant with no following vowel (loan/typo)
        else:
            sylls.append((word[i], "", False, False))  # unknown char — pass through so it surfaces
            i += 1
    return sylls


def _stressed_index(sylls) -> int | None:
    """Index of the syllable carrying primary stress.

    Definitive accent (an acute vowel) OVERRIDES the default: if any syllable is accented, primary
    stress falls on the last accented one. Otherwise stress falls on the penultimate mora.
    """
    accented = [idx for idx, (_o, v, _l, acc) in enumerate(sylls) if v and acc]
    if accented:
        return accented[-1]
    morae = []  # syllable index per mora (long vowel contributes two)
    for idx, (_o, v, is_long, _a) in enumerate(sylls):
        if v:
            morae.append(idx)
            if is_long:
                morae.append(idx)
    if not morae:
        return None
    return morae[max(0, len(morae) - 2)]


def _g2p_word(word: str) -> str:
    sylls = _syllabify(word)
    stress_at = _stressed_index(sylls)
    out = []
    for idx, (onset, v, is_long, _acc) in enumerate(sylls):
        if idx == stress_at:
            out.append(STRESS)
        out.append(onset)
        out.append(v + (LENGTH if is_long else ""))
    return "".join(out)


def g2p(text: str) -> str:
    """Convert Tongan orthography (canonical U+02BB ʻokina + macron/acute vowels) to phonemic IPA."""
    text = unicodedata.normalize("NFC", text).lower()
    return " ".join(_g2p_word(w) for w in text.split())


# ─── Phonemic normalisation, for comparing IPA from different sources ─────────
# Folds narrow field-transcription detail onto Tongan's phonemic inventory so that
# transcriptions using different conventions (ɑ vs a, doubled vowels vs ː, dental t̪, /k/-as-q,
# breathy onsets) compare equal. Applied to BOTH g2p() output and a reference IPA in tests.
_QUALITY = {
    "ɑ": "a", "ɒ": "a", "ɔ": "o", "ɛ": "e", "æ": "a",  # ɑ ɒ ɔ ɛ æ
    "ə": "a", "ʌ": "a", "ɐ": "a",                                # ə ʌ ɐ
    "ɷ": "u", "ʊ": "u", "ɩ": "i", "ɪ": "i", "ɨ": "i",  # ɷ ʊ ɩ ɪ ɨ
    "q": "k", "ɫ": "l", "ɾ": "l", "w": "u", "j": "i",                       # q ɫ ɾ(=allophone of /l/) w j
}
_STRIP_CHARS = [STRESS, "ˌ", "ʱ", "ʰ", " ", ".", ",", "!", "ǃ", "?", "ˈ"]


def phonemicize(ipa: str) -> str:
    """Reduce an IPA string to a comparable Tongan phonemic skeleton (no stress, canonical length)."""
    s = unicodedata.normalize("NFD", ipa)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")  # drop combining diacritics
    for ch in _STRIP_CHARS:
        s = s.replace(ch, "")
    s = "".join(_QUALITY.get(ch, ch) for ch in s)
    # expand Vː -> VV, then collapse any run of an identical vowel (len>=2) -> Vː
    expanded = []
    for ch in s:
        if ch == LENGTH and expanded and expanded[-1] in VOWEL_PHONEMES:
            expanded.append(expanded[-1])
        else:
            expanded.append(ch)
    s, res, i = "".join(expanded), [], 0
    while i < len(s):
        ch = s[i]
        if ch in VOWEL_PHONEMES:
            j = i
            while j < len(s) and s[j] == ch:
                j += 1
            res.append(ch + (LENGTH if j - i >= 2 else ""))
            i = j
        else:
            res.append(ch)
            i += 1
    return "".join(res)


# ─── Definitive-accent gap heuristic (WARNINGS ONLY — never changes g2p output) ───────────────
# The definitive accent (toloi) is written inconsistently in real Tongan text. This flags clauses
# where a definite article (`e`/`he`) is present but the clause-final content word carries no acute
# — a place a native reviewer might expect the accent. It is deliberately noisy and advisory: use
# it to build a review backlog, NOT to synthesise pronunciation. We honor written accents; we never
# PREDICT unwritten ones.
_ACUTE_VOWELS = set("áéíóú")
_DETERMINERS = {"e", "he"}  # the (common + definite article)
# enclitics/particles that commonly end a clause WITHOUT taking the definitive accent — skip them
_CLAUSE_FINAL_SKIP = {"pe", "pē", "ia", "ai", "au", "koe", "atu", "mai", "ange", "ni", "na",
                      "kita", "kimoua", "kinautolu", "foki", "leva", "nai", "e", "he", "a", "ki", "mo"}


def _bare(token: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFC", token.lower())
                   if ch.isalpha() or ch in "āēīōūáéíóú" or ch == OKINA)


def flag_missing_definitive(text: str) -> list[dict]:
    """Return advisory flags for clause-final words that MIGHT be missing a written definitive
    accent (a determiner e/he appears in the clause and the final content word has no acute)."""
    flags: list[dict] = []
    for clause in re.split(r"[,.;:!?“”\"()]", text):
        toks = [t for t in clause.split() if _bare(t)]
        if not toks:
            continue
        bares = [_bare(t) for t in toks]
        if not any(b in _DETERMINERS for b in bares):
            continue
        # last content token that isn't a bare enclitic/particle
        for tok, b in zip(reversed(toks), reversed(bares)):
            if b in _CLAUSE_FINAL_SKIP:
                continue
            if not (_ACUTE_VOWELS & set(b)):
                flags.append({"word": tok, "clause": clause.strip()})
            break
    return flags


if __name__ == "__main__":
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            print(f"{arg}\t{g2p(arg)}")
    else:
        for w in ["fale", "kumā", "mālohi", "kikī", f"{OKINA}ufi", "vakapuna", "Tōnga"]:
            print(f"{w}\t{g2p(w)}")
