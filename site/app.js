/* Contribute site — front-end only. The accept/transcode pipeline (Cloud Function) is stubbed;
   set LTS_CONFIG.submitEndpoint once the Firebase project exists. Vanilla JS, no deps. */
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
    // Seconds of audio recorded in this session — drives the "minutes contributed" readout.
    // The authoritative duration is measured server-side by ffprobe at accept time.
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
      state.prompts = shuffle(await res.json());
    } catch {
      state.prompts = [{ promptId: "fallback-001", tongan: "Mālō e lelei", english: "Hello", tags: [] }];
    }
    renderPrompt();
  }

  /** Position within the current session (0-based), and how long a session actually is — the
   *  final session is short if the corpus runs out. */
  const sessionPos = () => state.idx % SESSION_SIZE;
  const sessionStart = () => state.idx - sessionPos();
  const sessionLen = () => Math.min(SESSION_SIZE, state.prompts.length - sessionStart());

  function showStudio(show) {
    $("session-done").hidden = show;
    for (const id of ["prompt-block", "recorder-block", "actions-block"]) $(id).hidden = !show;
  }

  function renderPrompt() {
    const p = state.prompts[state.idx];
    if (!p) return renderCorpusExhausted();
    // Session boundary — but only once per boundary, or "Record N more" would bounce straight
    // back to the done screen.
    if (state.idx > 0 && sessionPos() === 0 && state.shownDoneAt !== state.idx) return renderSessionDone();
    showStudio(true);
    $("prompt-tongan").textContent = p.tongan;
    $("prompt-english").textContent = p.english;
    // Progress is against the SESSION, not the corpus: "Phrase 1 of 1700" reads as endless work.
    const left = Math.round(((sessionLen() - sessionPos()) * 7) / 60);
    $("prompt-progress").textContent =
      `Phrase ${sessionPos() + 1} of ${sessionLen()}` + (left >= 1 ? ` · about ${left} min left` : " · nearly done");
    resetRecording();
  }

  function renderSessionDone() {
    state.shownDoneAt = state.idx;
    showStudio(false);
    const mins = state.sessionSeconds / 60;
    const amount = mins >= 1 ? `${mins.toFixed(1)} minutes` : `${Math.round(state.sessionSeconds)} seconds`;
    $("session-done-sub").textContent =
      `You've contributed ${amount} of Tongan speech. Every clip is reviewed before it joins the open dataset.`;
    const more = state.prompts.length - state.idx;
    $("btn-continue").hidden = more <= 0;
    $("btn-continue").textContent = `Record ${Math.min(SESSION_SIZE, more)} more`;
    setStatus("");
  }

  function renderCorpusExhausted() {
    showStudio(false);
    $("session-done-sub").textContent =
      "That's every phrase we have — mālō ʻaupito. Check back as more are added.";
    $("btn-continue").hidden = true;
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
      demographics: currentDemographics(),
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
  function advance() {
    state.idx += 1;
    // Demographics describe the SPEAKER, not the clip, and the same person records the whole
    // session — so they are deliberately NOT cleared here. Clearing them made every submission
    // after the first send nulls, which the server then merged over the speaker's real answers.
    setTimeout(() => { renderPrompt(); }, 700);
  }
  $("btn-submit").addEventListener("click", submit);
  $("btn-skip").addEventListener("click", () => { setStatus(""); advance(); });
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
