#!/usr/bin/env node
/**
 * Provenance + shape gate for prompt seed files.
 *
 * Enforces docs/adr/0005-prompt-text-provenance.md. Prompt text is published permanently in every
 * CC BY 4.0 release and cannot be recalled (docs/CONSENT.md), so this runs BEFORE seeding rather
 * than after. ADR-0005 claims the constraint is enforceable in code — this is that code.
 *
 *   node scripts/check-prompts.mjs [file.jsonl ...]     # default: data/seed-prompts.example.jsonl
 *
 * Exits non-zero on any violation. No dependencies (same posture as model/g2p/test_ton_g2p.py).
 */
import { readFileSync } from "node:fs";

// ADR-0005: only own-authored, community-contributed, or public-domain text may become a prompt.
// `unverified` is a holding value — it can be committed, but never seeded.
const TEXT_SOURCES = new Set(["authored", "community", "public-domain", "unverified"]);
const SEEDABLE_TEXT_SOURCES = new Set(["authored", "community", "public-domain"]);
// Glosses may be machine-translated (flagged for human check); Tongan text may never be.
const GLOSS_SOURCES = new Set(["authored", "community", "public-domain", "azure-mt"]);
const STATUSES = new Set(["active", "draft", "retired"]);

// Sources that are reference-only and must never supply prompt text (ADR-0005 + CONTRIBUTING.md #4).
const FORBIDDEN = new Set(["churchward", "ncea-l1", "ncea", "ucla", "shumway", "azure-mt", "mt"]);

const files = process.argv.slice(2);
if (!files.length) files.push("data/seed-prompts.example.jsonl");

const errors = [];
let checked = 0;
let seedable = 0;

for (const file of files) {
  let lines;
  try {
    lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    errors.push(`${file}: cannot read (${err.message})`);
    continue;
  }

  const seen = new Set();
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    let p;
    try {
      p = JSON.parse(line);
    } catch {
      errors.push(`${where}: not valid JSON`);
      return;
    }
    checked++;

    for (const field of ["promptId", "tongan", "english", "textSource", "glossSource", "status"]) {
      if (typeof p[field] !== "string" || !p[field].trim()) errors.push(`${where}: missing ${field}`);
    }
    if (seen.has(p.promptId)) errors.push(`${where}: duplicate promptId ${p.promptId}`);
    seen.add(p.promptId);

    // The rule ADR-0005 exists to enforce.
    if (FORBIDDEN.has(p.textSource)) {
      errors.push(`${where}: textSource "${p.textSource}" is reference-only and must never become prompt text (ADR-0005)`);
    } else if (p.textSource && !TEXT_SOURCES.has(p.textSource)) {
      errors.push(`${where}: unknown textSource "${p.textSource}" (allowed: ${[...TEXT_SOURCES].join(", ")})`);
    }
    if (p.glossSource && !GLOSS_SOURCES.has(p.glossSource)) {
      errors.push(`${where}: unknown glossSource "${p.glossSource}"`);
    }
    if (p.status && !STATUSES.has(p.status)) {
      errors.push(`${where}: unknown status "${p.status}" (allowed: ${[...STATUSES].join(", ")})`);
    }

    // A prompt only reaches contributors when active — so that is where the bar is highest.
    if (p.status === "active") {
      seedable++;
      if (!SEEDABLE_TEXT_SOURCES.has(p.textSource)) {
        errors.push(`${where}: status "active" requires verified provenance, got textSource "${p.textSource}" — mark it "draft" until a fluent speaker confirms it`);
      }
      if (p.glossSource === "azure-mt" && p.glossChecked !== true) {
        errors.push(`${where}: status "active" with an unchecked machine-translated gloss — set glossChecked once verified, or mark the prompt "draft"`);
      }
    }
    if (p.targetRecordings !== undefined && !Number.isInteger(p.targetRecordings)) {
      errors.push(`${where}: targetRecordings must be an integer`);
    }
  });
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error(`\nSee docs/adr/0005-prompt-text-provenance.md`);
  process.exit(1);
}
console.log(`✓ ${checked} prompt(s) checked, ${seedable} seedable (active) — provenance OK`);
