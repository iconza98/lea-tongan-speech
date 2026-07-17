// Runtime config for the Contribute site. No secrets here — this file is public.
window.LTS_CONFIG = {
  // The Cloud Function endpoint that accepts a contribution (multipart: audio + meta).
  // null → the site runs in STUB mode: it validates and assembles the payload but does not
  // upload (logs to console + lets you play back). Set this once the Firebase project exists.
  submitEndpoint: null,

  // Must match the consentVersion in docs/CONSENT.md. Stamped on every submitted clip.
  consentVersion: "2026-07-16-v1",

  // Where the seed prompts come from (Tongan + English pairs to read).
  promptsUrl: "prompts.sample.json",

  // Max recording length (seconds) — keeps clips short and storage sane.
  maxRecordSeconds: 15,
};
