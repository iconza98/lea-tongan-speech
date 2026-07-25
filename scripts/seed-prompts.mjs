#!/usr/bin/env node
/**
 * Seed the `prompts` collection in Firestore from a JSONL file (idempotent upsert by promptId).
 *
 * Auth: uses your gcloud owner credentials (`gcloud auth print-access-token`), which bypass the
 * deny-all client security rules — writes go in as admin. No service-account key needed.
 *
 * Refuses to run unless scripts/check-prompts.mjs passes, and seeds ONLY `status: "active"` rows.
 * Prompt text is published permanently and cannot be recalled (docs/CONSENT.md), so provenance is
 * gated here rather than caught in review — see docs/adr/0005-prompt-text-provenance.md.
 *
 * Usage:
 *   node scripts/seed-prompts.mjs [path-to.jsonl]     # default: data/seed-prompts.example.jsonl
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PROJECT = "lea-tongan-speech";
const FILE = process.argv[2] || "data/seed-prompts.example.jsonl";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") fields[k] = { stringValue: v };
    else if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
    else if (typeof v === "number") fields[k] = { doubleValue: v };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map((x) => ({ stringValue: String(x) })) } };
  }
  return fields;
}

// Provenance gate (ADR-0005). Non-zero exit here aborts the seed — writes are unrecallable.
try {
  execSync(`node scripts/check-prompts.mjs ${JSON.stringify(FILE)}`, { stdio: "inherit" });
} catch {
  console.error("\nAborted: prompt provenance check failed. Nothing was written.");
  process.exit(1);
}

const all = readFileSync(FILE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
// Only `active` prompts reach contributors. `draft` = awaiting fluent-speaker verification.
const rows = all.filter((p) => p.status === "active");
const skipped = all.length - rows.length;
if (skipped) console.log(`Skipping ${skipped} non-active prompt(s) (draft/retired).`);

const bearer = token();
let ok = 0;

for (const p of rows) {
  const res = await fetch(`${BASE}/prompts/${encodeURIComponent(p.promptId)}`, {
    method: "PATCH", // upsert by document id
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(p) }),
  });
  if (res.ok) { ok++; console.log(`  ✓ ${p.promptId}  ${p.tongan}`); }
  else console.error(`  ✗ ${p.promptId}  HTTP ${res.status}  ${(await res.text()).slice(0, 200)}`);
}
console.log(`\nSeeded ${ok}/${rows.length} prompts into ${PROJECT}/prompts`);
process.exit(ok === rows.length ? 0 : 1);
