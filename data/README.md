# data/

Corpus schema + eval gold-set fetch scripts. **No audio is committed here** (see `.gitignore`).

- `schema.*` — the clip/corpus data model *(TBD — Phase 1)*:
  `{clipId, audioPath, tongan, english, speakerId, dialect?, ageBand?, gender?, consentVersion, status}`.
- Seed prompts + English glosses (seeded from the app's curated / Azure translation data).
- `fetch-goldsets.*` — download scripts for UCLA/NCEA **eval** data into a git-ignored local path.
  This data is CC BY-NC / BY-NC-SA: **evaluation only, never training, never redistributed.**

Published corpus audio lives in the Storage bucket and the Hugging Face Dataset mirror.
