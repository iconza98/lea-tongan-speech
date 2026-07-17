#!/usr/bin/env node
/**
 * Manage the reviewer allowlist — the `emails` array on Firestore `adminConfig/reviewers`
 * that `assertReviewer` (functions/src/index.ts) checks on every reviewer action.
 *
 * Auth: uses your gcloud owner credentials (`gcloud auth print-access-token`), which bypass the
 * deny-all client security rules — reads/writes go in as admin. No service-account key needed.
 *
 * Usage:
 *   node scripts/reviewers.mjs list
 *   node scripts/reviewers.mjs add <email>
 *   node scripts/reviewers.mjs remove <email>
 *
 * Emails are matched exactly against the Firebase Auth token's `email` claim, so they are stored
 * lowercased+trimmed (Firebase normalizes the token email to lowercase). See docs/reviewing.md.
 */
import { execSync } from "node:child_process";

const PROJECT = "lea-tongan-speech";
const DOC = "adminConfig/reviewers";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const URL = `${BASE}/${DOC}`;

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error("Usage:\n  node scripts/reviewers.mjs list\n  node scripts/reviewers.mjs add <email>\n  node scripts/reviewers.mjs remove <email>");
  process.exit(msg ? 1 : 0);
}

function normalize(email) {
  return String(email).trim().toLowerCase();
}

async function readEmails(bearer) {
  const res = await fetch(URL, { headers: { Authorization: `Bearer ${bearer}` } });
  if (res.status === 404) return null; // doc doesn't exist yet
  if (!res.ok) throw new Error(`read ${DOC} → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const doc = await res.json();
  const values = doc.fields?.emails?.arrayValue?.values ?? [];
  return values.map((v) => v.stringValue).filter((s) => s != null);
}

async function writeEmails(bearer, emails) {
  // PATCH with updateMask upserts the doc and touches only the `emails` field.
  const res = await fetch(`${URL}?updateMask.fieldPaths=emails`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { emails: { arrayValue: { values: emails.map((e) => ({ stringValue: e })) } } } }),
  });
  if (!res.ok) throw new Error(`write ${DOC} → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const [cmd, arg] = process.argv.slice(2);
if (!cmd || ["-h", "--help", "help"].includes(cmd)) usage();

const bearer = token();
const current = (await readEmails(bearer)) ?? [];

if (cmd === "list") {
  if (current.length === 0) console.log("(no reviewers — allowlist is empty or the doc doesn't exist)");
  else current.forEach((e) => console.log(`  ${e}`));
  console.log(`\n${current.length} reviewer(s) in ${PROJECT}/${DOC}`);
  process.exit(0);
}

if (cmd === "add" || cmd === "remove") {
  if (!arg) usage(`"${cmd}" needs an <email>`);
  const email = normalize(arg);
  const has = current.includes(email);

  if (cmd === "add") {
    if (has) { console.log(`Already a reviewer: ${email} (no change)`); process.exit(0); }
    await writeEmails(bearer, [...current, email]);
    console.log(`✓ Added ${email} — ${current.length + 1} reviewer(s) now`);
  } else {
    if (!has) { console.log(`Not a reviewer: ${email} (no change)`); process.exit(0); }
    await writeEmails(bearer, current.filter((e) => e !== email));
    console.log(`✓ Removed ${email} — ${current.length - 1} reviewer(s) now`);
  }
  process.exit(0);
}

usage(`unknown command "${cmd}"`);
