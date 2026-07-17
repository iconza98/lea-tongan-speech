# eval/

Automated evaluation harness → versioned scorecards for the leaderboard.

v1 metrics:

- **CER** (character error rate) via a Whisper pass over synthesized speech.
- **Speaker similarity** (for voice-cloning fidelity).
- **G2P / ʻokina + macron coverage** against gold-sets.

Gold-sets (UCLA / NCEA) are **referenced, not redistributed** — fetch scripts live in
[`../data`](../data); their audio is git-ignored and used for evaluation only.

Community **MOS** listening tests come later, once there are clips to rate. *TBD — Phase 2.*
