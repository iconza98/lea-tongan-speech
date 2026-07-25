/* Contribute site front-end. Live: submissions POST to LTS_CONFIG.submitEndpoint (/api/submit →
   the submitContribution Cloud Function); set it to null to fall back to stub mode. Vanilla JS,
   no deps, no build step. Session arithmetic lives in session.js so it can be tested without a DOM.

   This page auto-deploys to production on merge to main (.github/workflows/deploy-hosting.yml). */
(() => {
  "use strict";
  const cfg = window.LTS_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
      tab.classList.add("is-active");
      $("view-" + tab.dataset.view).classList.add("is-active");
      onViewShown(tab.dataset.view);
    });
  });

  // ── Firestore read (Dataset + Leaderboard tabs) ─────────────────────────────
  const FS = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;
  const loaded = {};
  function onViewShown(view) {
    if (view === "leaderboard" && !loaded.leaderboard) { loaded.leaderboard = true; loadLeaderboard(); }
    if (view === "browse" && !loaded.browse) { loaded.browse = true; loadDataset(); }
  }
  function decodeVal(v) {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("nullValue" in v) return null;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeVal);
    if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
    if ("timestampValue" in v) return v.timestampValue;
    return null;
  }
  function decodeFields(fields) { const o = {}; for (const k in fields) o[k] = decodeVal(fields[k]); return o; }
  const pct = (r) => (r === null || r === undefined ? "—" : Math.round(r * 100) + "%");

  async function loadLeaderboard() {
    const el = $("leaderboard-body");
    try {
      const res = await fetch(`${FS}/evalRuns?key=${cfg.firebaseApiKey}&pageSize=100`);
      const docs = (await res.json()).documents || [];
      if (!docs.length) { el.innerHTML = '<p class="stub">No scorecards yet — the eval harness publishes them as models are evaluated.</p>'; return; }
      const rows = docs.map((d) => decodeFields(d.fields)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      el.innerHTML =
        '<div class="tblwrap"><table class="tbl"><thead><tr>' +
        "<th>Model</th><th>Date</th><th>ʻokina</th><th>macron</th><th>CER</th><th>Sim</th><th>MOS</th>" +
        "</tr></thead><tbody>" +
        rows.map((r) => {
          const g = (r.metrics && r.metrics.g2p_coverage) || {};
          return `<tr><td>${esc(r.model)}</td><td>${esc(r.date)}</td>` +
            `<td>${pct(g.okina && g.okina.rate)}</td><td>${pct(g.macron && g.macron.rate)}</td>` +
            `<td>${r.metrics && r.metrics.cer != null ? r.metrics.cer : "—"}</td>` +
            `<td>${r.metrics && r.metrics.speaker_similarity != null ? r.metrics.speaker_similarity : "—"}</td>` +
            `<td>${r.metrics && r.metrics.mos != null ? r.metrics.mos : "—"}</td></tr>`;
        }).join("") +
        "</tbody></table></div>";
    } catch (err) { el.innerHTML = `<p class="stub">Couldn't load scorecards (${esc(String(err))}).</p>`; }
  }

  async function loadDataset() {
    const summary = $("dataset-summary"), list = $("dataset-list");
    try {
      const res = await fetch(`${FS}:runQuery?key=${cfg.firebaseApiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: "clips" }],
          where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "approved" } } },
          limit: 200,
        } }),
      });
      const clips = (await res.json()).filter((r) => r.document).map((r) => decodeFields(r.document.fields));
      if (!clips.length) { summary.textContent = "No published clips yet — be the first to contribute your voice."; list.innerHTML = ""; return; }
      summary.textContent = `${clips.length} approved clip${clips.length === 1 ? "" : "s"}.`;
      list.innerHTML = clips.map((c) =>
        `<div class="row"><span class="row-to">${esc(c.transcript)}</span><span class="row-en">${esc(c.english)}</span></div>`
      ).join("");
    } catch (err) { summary.textContent = "Couldn't load the dataset (" + String(err) + ")."; }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ── State ─────────────────────────────────────────────────────────────────
  const SESSION_SIZE = Math.max(1, cfg.sessionSize || 25);
  const state = {
    prompts: [],
    idx: 0,
    // Seconds of audio submitted since this page loaded — drives the "minutes contributed"
    // readout. Cumulative across sessions on purpose: a contributor who keeps going should see
    // their running total, not a figure that resets. The authoritative per-clip duration is
    // measured server-side by ffprobe at accept time; this is display only.
    sessionSeconds: 0,
    // idx at which the session-complete screen was last shown (see renderPrompt)
    shownDoneAt: -1,
    // client-measured length of the take currently held in state.blob
    lastDurationSec: 0,
    stream: null,
    recorder: null,
    chunks: [],
    blob: null,
    recording: false,
    timerId: null,
    startedAt: 0,
    // a random, pseudonymous speaker id for this browser (grouping only — never a name)
    speakerId: getSpeakerId(),
  };

  function getSpeakerId() {
    const KEY = "lts_speaker_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = "spk_" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      localStorage.setItem(KEY, id);
    }
    return id;
  }

  // ── Consent gate ──────────────────────────────────────────────────────────
  const consentBoxes = ["c-age", "c-voice", "c-license"].map($);
  function consentGranted() { return consentBoxes.every((b) => b.checked); }
  function refreshConsent() {
    const ok = consentGranted();
    $("studio").setAttribute("aria-disabled", String(!ok));
    $("btn-record").disabled = !ok;
    if (!ok) { $("btn-submit").disabled = true; }
  }
  consentBoxes.forEach((b) => b.addEventListener("change", refreshConsent));

  // ── Prompts ───────────────────────────────────────────────────────────────
  /** Fisher–Yates. Contributors are served a shuffled corpus so they don't all record the same
   *  opening prompts — with one shared ordering, prompt #1 gets every contributor and prompt #900
   *  gets none. */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  async function loadPrompts() {
    try {
      const res = await fetch(cfg.promptsUrl || "prompts.sample.json");
      // Without these checks a 404 page or a shape change (e.g. {prompts:[...]}) yields a non-array
      // that shuffle() passes through untouched, and the contributor is shown "that's every phrase"
      // — a deploy failure presented as successful completion.
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!Array.isArray(json) || !json.length) throw new Error("prompts payload is not a non-empty array");
      state.prompts = shuffle(json);
    } catch (err) {
      console.error("[prompts] falling back:", err);
      state.prompts = [{ promptId: "fallback-001", tongan: "Mālō e lelei", english: "Hello", tags: [] }];
    }
    renderPrompt();
  }

  /** Show the studio, or the session-complete screen. The `hidden` attribute alone is not enough:
   *  styles.css carries `[hidden]{display:none !important}` so it actually beats the author-origin
   *  `display:flex` on several of these blocks. */
  function showStudio(show) {
    $("session-done").hidden = show;
    $("demographics").hidden = !show;
    for (const id of ["prompt-block", "recorder-block", "actions-block"]) $(id).hidden = !show;
  }

  function renderPrompt() {
    const v = LTSSession.sessionView({
      idx: state.idx, total: state.prompts.length,
      size: SESSION_SIZE, shownDoneAt: state.shownDoneAt,
    });
    if (v.screen === "done") return renderSessionDone(v);
    showStudio(true);
    const p = state.prompts[state.idx];
    $("prompt-tongan").textContent = p.tongan;
    $("prompt-english").textContent = p.english;
    // Progress is against the SESSION, not the corpus: "Phrase 1 of 1700" reads as endless work.
    $("prompt-progress").textContent = v.label;
    resetRecording();
    setControlsBusy(false);
  }

  function renderSessionDone(v) {
    state.shownDoneAt = state.idx;
    // A terminal screen is reachable holding a recorded-but-unsubmitted take (record, then Skip).
    // Without this reset the blob stays live and Submit stays enabled, filing that audio under the
    // NEXT prompt — mismatched audio and transcript landing in the corpus.
    resetRecording();
    showStudio(false);
    setControlsBusy(false);
    const mins = state.sessionSeconds / 60;
    const amount = mins >= 1 ? `${mins.toFixed(1)} minutes` : `${Math.round(state.sessionSeconds)} seconds`;
    const thanks = state.sessionSeconds > 0
      ? `You've contributed ${amount} of Tongan speech. Every clip is reviewed before it joins the open dataset.`
      : "Every clip is reviewed before it joins the open dataset.";
    $("session-done-sub").textContent = v.isFinal
      ? `${thanks} That's every phrase we have for now — check back as more are added.`
      : thanks;
    $("btn-continue").hidden = v.continueCount <= 0;
    $("btn-continue").textContent = `Record ${v.continueCount} more`;
    setStatus("");
  }

  // ── Recording (MediaRecorder) ───────────────────────────────────────────────
  async function ensureStream() {
    if (state.stream) return state.stream;
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return state.stream;
  }
  function pickMime() {
    const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
  }
  async function startRecording() {
    try {
      const stream = await ensureStream();
      state.chunks = [];
      const mime = pickMime();
      state.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      state.recorder.ondataavailable = (e) => { if (e.data.size) state.chunks.push(e.data); };
      state.recorder.onstop = onRecordingStop;
      state.recorder.start();
      state.recording = true;
      state.startedAt = performance.now();
      tick();
      $("btn-record").textContent = "■ Stop";
      $("btn-record").classList.add("is-recording");
      setStatus("Recording… read the phrase aloud.");
    } catch (err) {
      setStatus("Microphone access is needed to record. " + (err && err.message || ""), true);
    }
  }
  function stopRecording() {
    if (state.recorder && state.recording) state.recorder.stop();
    state.recording = false;
    clearInterval(state.timerId);
    $("btn-record").textContent = "● Record";
    $("btn-record").classList.remove("is-recording");
  }
  function onRecordingStop() {
    state.lastDurationSec = (performance.now() - state.startedAt) / 1000;
    state.blob = new Blob(state.chunks, { type: state.recorder.mimeType || "audio/webm" });
    const url = URL.createObjectURL(state.blob);
    const pb = $("playback");
    pb.src = url; pb.hidden = false;
    $("btn-submit").disabled = !consentGranted();
    setStatus("Recorded. Play it back, re-record, or submit.");
  }
  function tick() {
    const max = cfg.maxRecordSeconds || 15;
    state.timerId = setInterval(() => {
      const s = (performance.now() - state.startedAt) / 1000;
      $("rec-timer").textContent = s.toFixed(1) + "s";
      if (s >= max) { stopRecording(); setStatus(`Reached the ${max}s limit — stopped.`); }
    }, 100);
  }
  function resetRecording() {
    state.blob = null; state.chunks = []; state.lastDurationSec = 0;
    $("rec-timer").textContent = "0.0s";
    const pb = $("playback"); pb.hidden = true; pb.removeAttribute("src");
    $("btn-submit").disabled = true;
  }
  $("btn-record").addEventListener("click", () => (state.recording ? stopRecording() : startRecording()));

  // ── Submit ──────────────────────────────────────────────────────────────────
  // Any interaction — including selecting "Prefer not to say" — makes the panel authoritative.
  for (const id of ["d-island", "d-age", "d-gender"]) {
    $(id).addEventListener("change", () => { state.demographicsTouched = true; });
  }
  function currentDemographics() {
    return {
      island: $("d-island").value || null,
      ageBand: $("d-age").value || null,
      gender: $("d-gender").value || null,
    };
  }
  function buildMeta() {
    const p = state.prompts[state.idx];
    return {
      promptId: p.promptId,
      transcript: p.tongan,      // what they were asked to say; a reviewer can correct it
      english: p.english,
      speakerId: state.speakerId,
      // Sent only once the contributor has actually touched the panel. Omitting it leaves their
      // stored answers alone; sending it is authoritative, so switching a field back to "Prefer
      // not to say" clears it server-side rather than being silently ignored.
      ...(state.demographicsTouched ? { demographics: currentDemographics() } : {}),
      consent: {
        version: cfg.consentVersion,
        confirmedAge: $("c-age").checked,
        confirmedOwnVoice: $("c-voice").checked,
        confirmedLicense: $("c-license").checked,
        at: new Date().toISOString(),
      },
    };
  }
  async function submit() {
    // No prompt at the cursor means we are on a terminal screen; buildMeta() would throw on
    // undefined and, because submit() is async, reject silently with no feedback to the user.
    if (state.busy || !state.prompts[state.idx]) return;
    if (!state.blob) { setStatus("Record the phrase first.", true); return; }
    if (!consentGranted()) { setStatus("Please confirm all three consent boxes.", true); return; }
    const meta = buildMeta();
    $("btn-submit").disabled = true;

    if (!cfg.submitEndpoint) {
      // STUB mode — no backend yet. Prove the payload is well-formed.
      console.log("[STUB submit] meta:", meta, "audio bytes:", state.blob.size);
      setStatus("✓ (stub) Contribution assembled — no backend configured yet. Advancing…");
      state.sessionSeconds += state.lastDurationSec;
      return advance();
    }
    try {
      const fd = new FormData();
      fd.append("meta", JSON.stringify(meta));
      fd.append("audio", state.blob, "source.webm");
      const res = await fetch(cfg.submitEndpoint, { method: "POST", body: fd });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setStatus("✓ Mālō! Your recording was submitted for review. Advancing…");
      state.sessionSeconds += state.lastDurationSec;
      advance();
    } catch (err) {
      $("btn-submit").disabled = false;
      setStatus("Upload failed: " + (err && err.message || "unknown") + ". Try again.", true);
    }
  }
  /** Lock the controls while the prompt is swapping. `state.idx` moves immediately but the visible
   *  prompt only changes 700 ms later, so anything recorded in that gap would be read against the
   *  OLD text and filed against the NEW one — mismatched audio and transcript. Also stops a second
   *  Skip click from double-advancing and skipping past a session boundary entirely. */
  function setControlsBusy(busy) {
    state.busy = busy;
    $("btn-record").disabled = busy || !consentGranted();
    $("btn-skip").disabled = busy;
    if (busy) $("btn-submit").disabled = true;
  }

  function advance() {
    if (state.busy) return;
    setControlsBusy(true);
    state.idx += 1;
    // Demographics describe the SPEAKER, not the clip, and the same person records the whole
    // session — so they are deliberately NOT cleared here. Clearing them made every submission
    // after the first send nulls, which the server then merged over the speaker's real answers.
    setTimeout(() => { renderPrompt(); }, 700);   // renderPrompt / renderSessionDone clear `busy`
  }
  $("btn-submit").addEventListener("click", submit);
  $("btn-skip").addEventListener("click", () => { if (!state.busy) { setStatus(""); advance(); } });
  $("btn-continue").addEventListener("click", () => { setStatus(""); renderPrompt(); });

  function setStatus(msg, isError) {
    const el = $("status");
    el.textContent = msg;
    el.className = "status" + (isError ? " is-error" : msg ? " is-ok" : "");
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  refreshConsent();
  loadPrompts();
})();
