#!/usr/bin/env node
/**
 * Seed the `prompts` collection in Firestore from a JSONL file (idempotent upsert by promptId).
 *
 * Auth: uses your gcloud owner credentials (`gcloud auth print-access-token`), which bypass the
 * deny-all client security rules — writes go in as admin. No service-account key needed.
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

const rows = readFileSync(FILE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
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
