// Runtime config for the Contribute site. No secrets here — this file is public.
window.LTS_CONFIG = {
  // The Cloud Function endpoint that accepts a contribution (multipart: audio + meta).
  // Served same-origin via the hosting rewrite (firebase.json → submitContribution).
  // Set to null to force STUB mode (assemble payload, log, no upload).
  submitEndpoint: "/api/submit",

  // Must match the consentVersion in docs/CONSENT.md. Stamped on every submitted clip.
  consentVersion: "2026-07-16-v1",

  // Where the seed prompts come from (Tongan + English pairs to read).
  promptsUrl: "prompts.sample.json",

  // Max recording length (seconds) — keeps clips short and storage sane.
  maxRecordSeconds: 15,

  // Public Firebase config for read-only Firestore REST access (Dataset + Leaderboard tabs).
  // The API key is a browser key — public by design, not a secret.
  projectId: "lea-tongan-speech",
  firebaseApiKey: "AIzaSyBXRcJxYi8rzr-4tnfZnNYsZ0MnJuAQm_8",
};
