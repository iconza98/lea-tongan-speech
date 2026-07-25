/* Pure session arithmetic for the contribute tool.
 *
 * Deliberately free of DOM, config, and browser APIs so it can be tested with plain node
 * (site/test-session.mjs) — the same posture as model/g2p/test_ton_g2p.py. The rendering bug this
 * logic previously hid was invisible to a DOM-attribute test, so the logic lives here and the DOM
 * layer stays thin enough to read.
 *
 * Loaded as a classic script (window.LTSSession) — the site has no build step.
 */
(function (root) {
  "use strict";

  /**
   * Decide what the contributor should be looking at.
   *
   * @param {object} s
   * @param {number} s.idx          index of the next prompt to serve (0-based)
   * @param {number} s.total        prompts available
   * @param {number} s.size         prompts per session
   * @param {number} s.shownDoneAt  idx at which the done screen was last shown (-1 = never)
   * @returns {{screen:'prompt'|'done', label:string, position:number, sessionLength:number,
   *            continueCount:number, isFinal:boolean}}
   */
  function sessionView(s) {
    const size = Math.max(1, s.size | 0);
    const total = Math.max(0, s.total | 0);
    const idx = Math.max(0, s.idx | 0);

    // Out of prompts — terminal. Checked FIRST so it wins, but it still reports as the `done`
    // screen (isFinal) rather than a separate one: a corpus that is an exact multiple of `size`
    // used to end here and silently swallow the contributor's completion summary.
    if (idx >= total) {
      return { screen: "done", label: "", position: 0, sessionLength: 0, continueCount: 0, isFinal: true };
    }

    const position = idx % size;                          // 0-based position within this session
    const sessionStart = idx - position;
    const sessionLength = Math.min(size, total - sessionStart);

    // Session boundary — but only once per boundary, else "Record more" bounces straight back.
    if (idx > 0 && position === 0 && s.shownDoneAt !== idx) {
      return {
        screen: "done",
        label: "",
        position: 0,
        sessionLength,
        continueCount: Math.min(size, total - idx),
        isFinal: false,
      };
    }

    return {
      screen: "prompt",
      // No time estimate: any per-prompt constant is fiction until the corpus settles at a known
      // utterance length, and the previous 7s guess overstated the shipped corpus by ~3x.
      label: `Phrase ${position + 1} of ${sessionLength}`,
      position,
      sessionLength,
      continueCount: 0,
      isFinal: false,
    };
  }

  root.LTSSession = { sessionView };
})(typeof window !== "undefined" ? window : globalThis);
