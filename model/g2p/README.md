# g2p — Tongan grapheme-to-phoneme

A small, **dependency-free** (Python stdlib only) grapheme-to-phoneme converter for Tongan.

Tongan orthography is near-perfectly phonemic, so a correct G2P is about a page of code. It exists
because a zero-shot TTS probe that phonemized Tongan through a Māori proxy scored 2/12 and failed
**every** ʻokina (glottal-stop) word — Māori has no phonemic /ʔ/.

## Dual use

1. **Evaluation** — `phonemicize()` puts any TTS output (or a reference IPA) on a common phonemic
   footing so the `eval/` harness can score ʻokina + macron coverage.
2. **Phonemizer** — if a phonemizer-dependent TTS fine-tune is pursued (eSpeak-ng has no Tongan),
   `g2p()` is a drop-in replacement for the broken proxy.

## Use

```bash
python ton_g2p.py "kumā"        # -> kuˈmaː
python ton_g2p.py "ʻufi" "Tōnga"
```

```python
from ton_g2p import g2p, phonemicize
g2p("mālō e lelei")             # phonemic IPA with stress + length
```

## What it encodes

- Consonants: `p t k ʔ f v s h m n ŋ l` (digraph `ng` → ŋ; ʻokina U+02BB → ʔ)
- Vowels: `a e i o u`, short or long (macron `ā ē ī ō ū` → `Vː`)
- Stress: penultimate **mora** (a long vowel = 2 morae)
- Definitive accent (toloi): an acute vowel `á é í ó ú` moves stress to that final mora and
  lengthens it — **honored when written, never predicted**.

## Tests

```bash
python test_ton_g2p.py     # script mode, non-zero exit on failure
pytest                     # also works — test_* functions assert
```

Three layers: **inline hard gates** (ʻokina → /ʔ/, macron → /Vː/) and a **connected-speech
regression** are self-contained and always run. An **optional UCLA archive regression** runs only
if a local `ucla-lexicon.json` is present — that data is CC BY-NC-SA (reference/eval only, never
committed, never training data). See [`ATTRIBUTION.md`](./ATTRIBUTION.md).
