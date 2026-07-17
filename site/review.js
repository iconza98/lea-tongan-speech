// Reviewer console — sign in, audition pending clips, approve/reject.
// Uses the Firebase JS SDK (auth + callable functions). Auth is enforced server-side by the
// reviewer allowlist (assertReviewer): a non-reviewer can sign in but every call is denied.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFunctions, httpsCallable }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-functions.js";

const cfg = window.LTS_CONFIG || {};
const $ = (id) => document.getElementById(id);

const app = initializeApp({
  apiKey: cfg.firebaseApiKey,
  authDomain: `${cfg.projectId}.firebaseapp.com`,
  projectId: cfg.projectId,
});
const auth = getAuth(app);
const fns = getFunctions(app, "us-west1"); // functions live in us-west1 (ADR-0003)
const call = (name) => httpsCallable(fns, name);

// ── Auth ─────────────────────────────────────────────────────────────────────
$("btn-signin").addEventListener("click", async () => {
  setSignInStatus("Signing in…");
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (e) { setSignInStatus(prettyErr(e), true); }
});
$("btn-signout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const signedIn = !!user;
  $("signin-card").hidden = signedIn;
  $("queue-card").hidden = !signedIn;
  $("btn-signout").hidden = !signedIn;
  if (signedIn) { $("who").textContent = `Signed in as ${user.email}`; loadQueue(); }
});

// ── Review queue ─────────────────────────────────────────────────────────────
async function loadQueue() {
  const q = $("queue"), sum = $("queue-summary");
  sum.textContent = "Loading…"; q.innerHTML = "";
  try {
    const { data } = await call("listPendingClips")({});
    const clips = data.clips || [];
    if (!clips.length) { sum.textContent = "🎉 No clips waiting — the queue is clear."; return; }
    sum.textContent = `${clips.length} clip${clips.length === 1 ? "" : "s"} awaiting review.`;
    clips.forEach((c) => q.appendChild(renderClip(c)));
  } catch (e) {
    sum.textContent = /permission-denied/.test(String(e))
      ? "Your account is not on the reviewer allowlist."
      : "Couldn't load the queue: " + prettyErr(e);
  }
}

function renderClip(c) {
  const el = document.createElement("div");
  el.className = "card clip";
  el.innerHTML =
    `<div class="clip-text"><span class="row-to">${esc(c.transcript)}</span>` +
    `<span class="row-en">${esc(c.english)}</span></div>` +
    `<div class="clip-actions">` +
    `<button class="btn btn-ghost act-play">▶ Play</button>` +
    `<audio class="clip-audio" controls hidden></audio>` +
    `<button class="btn act-reject">Reject</button>` +
    `<button class="btn btn-primary act-approve">Approve</button>` +
    `</div><div class="status clip-status"></div>`;
  const status = el.querySelector(".clip-status");
  const audio = el.querySelector(".clip-audio");

  el.querySelector(".act-play").addEventListener("click", async () => {
    status.textContent = "Loading audio…";
    try {
      const { data } = await call("getClipAudio")({ clipId: c.clipId });
      audio.src = `data:${data.contentType};base64,${data.base64}`;
      audio.hidden = false; audio.play(); status.textContent = "";
    } catch (e) { status.textContent = "Audio failed: " + prettyErr(e); }
  });
  el.querySelector(".act-approve").addEventListener("click", () => act(el, status, "acceptClip", { clipId: c.clipId }, "Approved ✓"));
  el.querySelector(".act-reject").addEventListener("click", () => {
    const notes = prompt("Reason for rejecting (optional):") || "";
    act(el, status, "rejectClip", { clipId: c.clipId, notes }, "Rejected");
  });
  return el;
}

async function act(el, status, fn, args, okMsg) {
  el.querySelectorAll("button").forEach((b) => (b.disabled = true));
  status.textContent = fn === "acceptClip" ? "Transcoding + approving…" : "Rejecting…";
  try {
    await call(fn)(args);
    status.textContent = okMsg; status.className = "status clip-status is-ok";
    setTimeout(() => { el.remove(); if (!$("queue").children.length) $("queue-summary").textContent = "🎉 Queue clear."; }, 900);
  } catch (e) {
    status.textContent = prettyErr(e); status.className = "status clip-status is-error";
    el.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

function setSignInStatus(m, err) { const s = $("signin-status"); s.textContent = m; s.className = "status" + (err ? " is-error" : ""); }
function prettyErr(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^Firebase:\s*/, "") : String(e); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
