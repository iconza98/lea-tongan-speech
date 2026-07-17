# functions/

Backend (Cloud Functions, own Firebase project). The contribution pipeline:

1. Accept an uploaded recording + its `pending` metadata doc.
2. Transcode to canonical mp3 (pattern ported from the app's `acceptAudioValidation` +
   `scripts/segment-audio.ts`).
3. Route to a **human reviewer moderation gate** (reviewer-allowlist).
4. On approval → clip becomes `published` and eligible for the dataset export.

Physically isolated from the app's Firebase project so the consent/licensing boundary is a
hard boundary, not a naming convention. *TBD — Phase 1.*
