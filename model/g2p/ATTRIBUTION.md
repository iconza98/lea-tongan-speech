# Attribution & License — UCLA Phonetics Lab Archive (Tongan)

The **optional** archive-regression layer in `test_ton_g2p.py` compares this G2P against IPA
transcriptions from the **UCLA Phonetics Lab Archive**, Tongan collection:

- Language index: <https://archive.phonetics.ucla.edu/Language/TON/ton.html>

## License: Creative Commons Attribution-NonCommercial-ShareAlike (CC BY-NC-SA 2.0)

The archive's contents are licensed under a
[Creative Commons license](http://creativecommons.org/licenses/by-nc/2.0/): free to copy,
distribute, or adapt for **noncommercial purposes**, with attribution, and any derivative must be
distributed under the **same** terms (ShareAlike / copyleft).

### How this repository stays on the right side of that

This is an **Apache-2.0 / CC BY 4.0, commercially-usable** project, so it must never let BY-NC-SA
terms attach to its code, dataset, or models. Therefore:

- **The UCLA lexicon is NOT committed here.** `ucla-lexicon.json` is git-ignored. The archive-
  regression layer runs only if you place a copy locally; it is skipped otherwise.
- **UCLA data is used for EVALUATION ONLY, never as training data.** A model is never trained on it,
  so the models stay commercially clean.
- **This G2P code is our own** and is not derived from the archive — it encodes Tongan phonology,
  not UCLA transcriptions. It is Apache-2.0.

## Suggested citation

> 2007. The UCLA Phonetics Lab Archive. Los Angeles, CA: UCLA Department of Linguistics.
> <http://archive.phonetics.ucla.edu/>

Funded by the U.S. National Science Foundation. Archive originally designed and developed by
Patrick Jones.
