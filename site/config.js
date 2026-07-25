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

  // Max recording length (seconds). Prompts target 4–10s of speech (data/schema.md), so this is
  // headroom above the longest expected read — NOT a target. Too low and long prompts get truncated.
  maxRecordSeconds: 25,

  // How many prompts make up one contribution session. ~25 × ~7s ≈ 3 minutes of speech, which
  // matches the "Three minutes" promise on the landing page. Progress is shown against this,
  // not against the whole corpus — "Phrase 1 of 1700" reads as endless.
  sessionSize: 25,

  // Public Firebase config for read-only Firestore REST access (Dataset + Leaderboard tabs).
  // The API key is a browser key — public by design, not a secret.
  projectId: "lea-tongan-speech",
  firebaseApiKey: "AIzaSyBXRcJxYi8rzr-4tnfZnNYsZ0MnJuAQm_8",
};
