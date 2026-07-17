#!/usr/bin/env node
/**
 * Export a CC BY 4.0 dataset release from the APPROVED clips: downloads each canonical FLAC and
 * writes a Hugging Face audio-folder-friendly layout (data/schema.md → "Published dataset export").
 *
 *   dist/lea-tongan-speech-<version>/
 *     clips/<clipId>.flac
 *     metadata.jsonl        one row per clip (HF maps `file_name` → audio)
 *     speakers.jsonl        speaker demographics
 *     README.md  LICENSE     (CC BY 4.0)
 *
 * Auth: gcloud owner creds (reads private clips/speakers + the private bucket). No client access.
 * Usage:  node scripts/export-dataset.mjs --version 2026.1 [--out dist]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const VERSION = val("--version", "dev");
const OUT = val("--out", "dist");
const PROJECT = "lea-tongan-speech";
const BUCKET = "lea-tongan-speech-corpus";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const token = () => execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const bearer = token();
const H = { Authorization: `Bearer ${bearer}` };

// Firestore typed-value decoder.
function dv(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dv);
  if ("mapValue" in v) return df(v.mapValue.fields || {});
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}
const df = (f) => { const o = {}; for (const k in f) o[k] = dv(f[k]); return o; };

async function approvedClips() {
  const res = await fetch(`${FS}:runQuery`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "clips" }],
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "approved" } } },
    } }),
  });
  return (await res.json()).filter((r) => r.document).map((r) => df(r.document.fields));
}
async function speaker(id) {
  const res = await fetch(`${FS}/speakers/${encodeURIComponent(id)}`, { headers: H });
  if (!res.ok) return null;
  return df((await res.json()).fields);
}
async function downloadObject(objectPath, dest) {
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) throw new Error(`download ${objectPath}: HTTP ${res.status}`);
  await new Promise((ok, no) => { const w = createWriteStream(dest); Readable.fromWeb(res.body).pipe(w); w.on("finish", ok); w.on("error", no); });
}

const root = join(OUT, `lea-tongan-speech-${VERSION}`);
mkdirSync(join(root, "clips"), { recursive: true });

const clips = await approvedClips();
const meta = [];
const speakers = new Map();
for (const c of clips) {
  const path = c.audio && c.audio.path;
  if (!path) continue;
  await downloadObject(path, join(root, "clips", `${c.clipId}.flac`));
  if (!speakers.has(c.speakerId)) speakers.set(c.speakerId, (await speaker(c.speakerId)) || {});
  const spk = speakers.get(c.speakerId);
  const demo = (spk && spk.demographics) || {};
  meta.push({
    clip_id: c.clipId, file_name: `clips/${c.clipId}.flac`,
    tongan: c.transcript, english: c.english, speaker_id: c.speakerId,
    island: demo.island ?? null, age_band: demo.ageBand ?? null, gender: demo.gender ?? null,
    duration_ms: c.audio.durationMs ?? null, sample_rate: c.audio.sampleRate ?? 24000,
  });
}

writeFileSync(join(root, "metadata.jsonl"), meta.map((m) => JSON.stringify(m)).join("\n") + (meta.length ? "\n" : ""));
writeFileSync(join(root, "speakers.jsonl"),
  [...speakers.entries()].map(([id, s]) => JSON.stringify({ speaker_id: id, ...((s && s.demographics) || {}) })).join("\n") + (speakers.size ? "\n" : ""));
copyFileSync("DATASET_LICENSE", join(root, "LICENSE"));
writeFileSync(join(root, "README.md"),
  `# Lea Tongan Speech — ${VERSION}\n\nOpen Tongan speech corpus. **${meta.length} clips**, ` +
  `${speakers.size} speakers. Licensed **CC BY 4.0** (see LICENSE).\n\n` +
  `Each row in \`metadata.jsonl\` maps \`file_name\` → a 24 kHz mono FLAC clip, with its Tongan ` +
  `transcript, English gloss, pseudonymous speaker id, and optional consented demographics.\n`);

console.log(`Exported ${meta.length} clips (${speakers.size} speakers) → ${root}`);
