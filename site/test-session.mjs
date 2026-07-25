#!/usr/bin/env node
/* Tests for site/session.js. No framework, no dependencies — `node site/test-session.mjs`,
 * non-zero exit on failure. Same posture as model/g2p/test_ton_g2p.py.
 *
 * These cases exist because a DOM-attribute test passed while the session UI did not render:
 * the logic is pinned here, and the DOM layer stays thin enough to review by eye.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const scope = {};
new Function("window", readFileSync(join(here, "session.js"), "utf8"))(scope);
const { sessionView } = scope.LTSSession;

let pass = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const view = (idx, total, size, shownDoneAt = -1) => sessionView({ idx, total, size, shownDoneAt });

t("first prompt of a full session", () => {
  const v = view(0, 700, 25);
  assert.equal(v.screen, "prompt");
  assert.equal(v.label, "Phrase 1 of 25");
});

t("corpus smaller than one session reports the real length, not the nominal one", () => {
  // The shipped corpus is 5 prompts against sessionSize 25 — it must not say "of 25".
  assert.equal(view(0, 5, 25).label, "Phrase 1 of 5");
  assert.equal(view(4, 5, 25).label, "Phrase 5 of 5");
});

t("last prompt before a boundary is still the prompt screen", () => {
  assert.equal(view(24, 700, 25).screen, "prompt");
  assert.equal(view(24, 700, 25).label, "Phrase 25 of 25");
});

t("boundary shows the done screen with a continue offer", () => {
  const v = view(25, 700, 25);
  assert.equal(v.screen, "done");
  assert.equal(v.isFinal, false);
  assert.equal(v.continueCount, 25);
});

t("continuing past a boundary resumes instead of bouncing back", () => {
  // shownDoneAt === idx means the done screen was already shown at this boundary.
  const v = view(25, 700, 25, 25);
  assert.equal(v.screen, "prompt");
  assert.equal(v.label, "Phrase 1 of 25");
});

t("the boundary re-arms at the next one", () => {
  assert.equal(view(50, 700, 25, 25).screen, "done");
});

t("final partial session offers only what is left", () => {
  const v = view(75, 85, 25);
  assert.equal(v.continueCount, 10);
  assert.equal(view(75, 85, 25, 75).label, "Phrase 1 of 10");
});

t("exhaustion is the done screen, marked final", () => {
  const v = view(7, 7, 25);
  assert.equal(v.screen, "done");
  assert.equal(v.isFinal, true);
  assert.equal(v.continueCount, 0);
});

t("corpus that is an exact multiple of size still reaches the final screen", () => {
  // Regression: exhaustion used to be checked after the boundary, so a 25/50/100-prompt corpus
  // ended on the wrong screen and the contributor never saw their summary.
  const v = view(50, 50, 25);
  assert.equal(v.screen, "done");
  assert.equal(v.isFinal, true);
  assert.equal(v.continueCount, 0);
});

t("exact multiple does not re-offer a continue after the last boundary", () => {
  assert.equal(view(25, 25, 25).continueCount, 0);
  assert.equal(view(25, 25, 25).isFinal, true);
});

t("empty corpus is final immediately", () => {
  const v = view(0, 0, 25);
  assert.equal(v.screen, "done");
  assert.equal(v.isFinal, true);
});

t("single-prompt corpus", () => {
  assert.equal(view(0, 1, 25).label, "Phrase 1 of 1");
  assert.equal(view(1, 1, 25).isFinal, true);
});

t("size of 1 makes every prompt a boundary", () => {
  assert.equal(view(0, 3, 1).screen, "prompt");
  assert.equal(view(1, 3, 1).screen, "done");
  assert.equal(view(1, 3, 1, 1).label, "Phrase 1 of 1");
});

t("degenerate inputs do not throw or produce negative lengths", () => {
  for (const v of [view(0, 10, 0), view(-5, 10, 25), view(0, -3, 25)]) {
    assert.ok(v.sessionLength >= 0);
    assert.ok(v.continueCount >= 0);
  }
});

t("every prompt is served exactly once across a full walk", () => {
  const total = 57, size = 25;
  const served = [];
  let idx = 0, shownDoneAt = -1, guard = 0;
  while (guard++ < 1000) {
    const v = view(idx, total, size, shownDoneAt);
    if (v.screen === "done") {
      if (v.isFinal) break;
      shownDoneAt = idx;            // contributor clicks "Record more"
      continue;
    }
    served.push(idx);
    idx += 1;
  }
  assert.ok(guard < 1000, "walk did not terminate");
  assert.deepEqual(served, [...Array(total).keys()]);
});

for (const [name, fn] of cases) {
  try {
    fn();
    pass++;
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}
const failed = cases.length - pass;
console.log(`${failed ? "✗" : "✓"} ${pass}/${cases.length} session tests passed`);
process.exit(failed ? 1 : 0);
