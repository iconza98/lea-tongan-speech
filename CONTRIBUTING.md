# Contributing

Two ways to help build open Tongan speech technology.

## Contribute your voice

Voice recordings are contributed through the project website, not through git. You
record a Tongan phrase, read and agree to the open-license consent
([`docs/CONSENT.md`](./docs/CONSENT.md)), and your clip — once a reviewer approves it —
becomes part of the CC BY 4.0 dataset. Every clip is contributed under an explicit,
irrevocable open licence, so please read the consent carefully.

## Contribute code

Pull requests welcome for the site, backend, model tooling, and eval harness.

**Hard rules for this public repo:**

1. **Never commit secrets.** No service-account keys, `.env` files, or Firebase config
   with credentials. The `.gitignore` blocks the known names — do not override it.
2. **Never commit audio.** Corpus and gold-set audio live in the Storage bucket / the
   published Hugging Face Dataset, never in git.
3. **Never commit model weights.** They are distributed via Hugging Face.
4. **Never add UCLA/NCEA (or other NonCommercial) data as training material.** It is
   evaluation-only and must not be redistributed. Keep the licensing boundary intact.

Code is licensed Apache-2.0; by contributing you agree your contribution is under that
licence.
