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
    });
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    prompts: [],
    idx: 0,
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
  async function loadPrompts() {
    try {
      const res = await fetch(cfg.promptsUrl || "prompts.sample.json");
      state.prompts = await res.json();
    } catch {
      state.prompts = [{ promptId: "fallback-001", tongan: "Mālō e lelei", english: "Hello", tags: [] }];
    }
    renderPrompt();
  }
  function renderPrompt() {
    const p = state.prompts[state.idx];
    if (!p) { $("prompt-tongan").textContent = "🎉 That's every phrase — mālō!"; $("prompt-english").textContent = ""; $("btn-record").disabled = true; $("btn-skip").disabled = true; return; }
    $("prompt-tongan").textContent = p.tongan;
    $("prompt-english").textContent = p.english;
    $("prompt-progress").textContent = `Phrase ${state.idx + 1} of ${state.prompts.length}`;
    resetRecording();
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
    state.blob = null; state.chunks = [];
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
      return advance();
    }
    try {
      const fd = new FormData();
      fd.append("meta", JSON.stringify(meta));
      fd.append("audio", state.blob, "source.webm");
      const res = await fetch(cfg.submitEndpoint, { method: "POST", body: fd });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setStatus("✓ Mālō! Your recording was submitted for review. Advancing…");
      advance();
    } catch (err) {
      $("btn-submit").disabled = false;
      setStatus("Upload failed: " + (err && err.message || "unknown") + ". Try again.", true);
    }
  }
  function advance() {
    state.idx += 1;
    $("d-island").value = ""; $("d-age").value = ""; $("d-gender").value = "";
    setTimeout(() => { renderPrompt(); }, 700);
  }
  $("btn-submit").addEventListener("click", submit);
  $("btn-skip").addEventListener("click", () => { setStatus(""); advance(); });

  function setStatus(msg, isError) {
    const el = $("status");
    el.textContent = msg;
    el.className = "status" + (isError ? " is-error" : msg ? " is-ok" : "");
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  refreshConsent();
  loadPrompts();
})();
