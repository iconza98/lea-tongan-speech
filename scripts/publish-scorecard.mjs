#!/usr/bin/env node
/**
 * Publish an eval scorecard to Firestore `evalRuns/{model}-{date}` (idempotent upsert), so the
 * leaderboard can render it. Runs eval/run.py to produce the scorecard, then writes via the
 * Firestore REST API using gcloud owner creds (bypasses the deny-all write rules).
 *
 * Usage:
 *   node scripts/publish-scorecard.mjs --model baseline-g2p [--words eval/sample-words.txt]
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const model = valOf("--model");
if (!model) { console.error("--model required"); process.exit(1); }
const words = valOf("--words");
const PROJECT = "lea-tongan-speech";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function valOf(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
function token() { return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(); }

// Firestore typed-value encoder (recursive).
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === "number") return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { nullValue: null };
}
function toFields(obj) { const f = {}; for (const [k, v] of Object.entries(obj)) f[k] = toValue(v); return f; }

// Produce the scorecard from the eval harness.
const cmd = `python3 eval/run.py --model ${JSON.stringify(model)}` + (words ? ` --words ${JSON.stringify(words)}` : "");
const card = JSON.parse(execSync(cmd, { encoding: "utf8" }));
const runId = `${card.model}-${card.date}`;

const res = await fetch(`${BASE}/evalRuns/${encodeURIComponent(runId)}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: toFields(card) }),
});
if (res.ok) console.log(`✓ published evalRuns/${runId}`);
else { console.error(`✗ HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
