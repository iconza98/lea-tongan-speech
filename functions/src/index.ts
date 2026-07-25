/**
 * Accept/transcode + moderation pipeline for the open Tongan speech corpus.
 *
 * DEPLOYED AND WORKING — all three functions have run in production (5 clips submitted, transcoded
 *    and approved end to end). `submitContribution` and the transcode/probe stage are additionally
 *    covered by an emulator run; see functions/README.md.
 *
 * Flow (data/schema.md + docs/adr/0001, 0002):
 *   site  ──POST multipart──▶  submitContribution  ──▶  submissions/{clipId}/source.<ext>
 *                                                        clips/{clipId} (status: pending)
 *   reviewer ──onCall──▶ acceptClip  ──transcode──▶  corpus/{clipId}/audio.flac (24k mono FLAC)
 *                                                     clips/{clipId} (status: approved)
 *   reviewer ──onCall──▶ rejectClip  ──▶  clips/{clipId} (status: rejected)
 */
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
// FieldValue comes from the modular entry point rather than `admin.firestore.FieldValue`, which
// works in production but is `undefined` under the FUNCTIONS EMULATOR — firebase-tools wraps
// `firebase-admin` to redirect it at the local emulators, and the statics hanging off
// `admin.firestore` don't survive that wrapper. `admin.firestore()` still works either way.
// Without this import the whole file is untestable locally: every write throws in the emulator
// while behaving perfectly once deployed.
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, statSync, rmSync } from "fs";
import Busboy from "busboy";
import { validateMeta, ValidationError } from "./lib/validateMeta";
import { transcodeToFlac, probeDurationMs } from "./lib/transcode";

// Deploy all functions to us-west1 (Oregon).
setGlobalOptions({ region: "us-west1" });

admin.initializeApp();
const db = admin.firestore();
// The open-corpus bucket (australia-southeast1). Accessed only by this admin SDK — clients never
// write to Storage directly, so no Firebase Storage security rules are needed.
const BUCKET_NAME = process.env.CORPUS_BUCKET || "lea-tongan-speech-corpus";
const bucket = admin.storage().bucket(BUCKET_NAME);

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

// ── Public: accept a contribution ────────────────────────────────────────────
export const submitContribution = onRequest(
  // invoker:"public" — anyone can submit a contribution (a public endpoint). The callables
  // (acceptClip/rejectClip) enforce auth INSIDE via assertReviewer; their Cloud Run services are
  // granted allUsers run.invoker manually (re-grant after any redeploy that resets IAM).
  { cors: true, memory: "256MiB", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("POST only");
      return;
    }
    try {
      const { meta: metaRaw, audio, mime } = await parseMultipart(req.headers, req.rawBody);
      if (!audio) throw new ValidationError("missing audio file");
      const meta = validateMeta(JSON.parse(metaRaw));

      const clipId = randomUUID();
      const ext = EXT_BY_MIME[mime.split(";")[0]] ?? "webm";
      const sourcePath = `submissions/${clipId}/source.${ext}`;
      await bucket.file(sourcePath).save(audio, { contentType: mime, resumable: false });

      const now = FieldValue.serverTimestamp();
      await db.collection("clips").doc(clipId).set({
        clipId,
        promptId: meta.promptId,
        speakerId: meta.speakerId,
        transcript: meta.transcript,
        english: meta.english,
        audio: { sourcePath, originalCodec: ext }, // path + duration filled at accept
        status: "pending",
        consent: meta.consent,
        releases: [],
        createdAt: now,
        updatedAt: now,
      });
      // Only write demographics the contributor actually answered. Every submission carries the
      // full {island, ageBand, gender} shape with nulls for "prefer not to say", and a merge writes
      // those nulls over whatever the speaker already told us — so a 25-clip session used to end
      // with the demographics blanked by clip 2. Absent > null here.
      const demographics: Record<string, string> = {};
      for (const [k, v] of Object.entries(meta.demographics)) {
        if (v !== null && v !== undefined) demographics[k] = v;
      }

      const speakerRef = db.collection("speakers").doc(meta.speakerId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(speakerRef);
        tx.set(
          speakerRef,
          {
            speakerId: meta.speakerId,
            ...(Object.keys(demographics).length ? { demographics } : {}),
            consentVersion: meta.consent.version,
            clipCount: FieldValue.increment(1),
            // Set once, on the speaker's first contribution (data/schema.md requires it).
            ...(snap.exists ? {} : { createdAt: now }),
            updatedAt: now,
          },
          { merge: true }
        );
      });

      res.status(200).json({ clipId });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.error("submitContribution failed", err);
      res.status(500).json({ error: "internal" });
    }
  }
);

// ── Reviewer-gated: accept (transcode → publish-eligible) ─────────────────────
export const acceptClip = onCall(
  { memory: "512MiB", timeoutSeconds: 120 },
  async (request: CallableRequest<{ clipId?: string }>) => {
    await assertReviewer(request);
    const clipId = request.data?.clipId;
    if (!clipId) throw new HttpsError("invalid-argument", "clipId required");

    const ref = db.collection("clips").doc(clipId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "clip not found");
    const clip = snap.data() as { status: string; audio: { sourcePath: string; originalCodec: string } };
    if (clip.status !== "pending") throw new HttpsError("failed-precondition", `status is ${clip.status}`);

    const srcLocal = join(tmpdir(), `${clipId}-src`);
    const flacLocal = join(tmpdir(), `${clipId}.flac`);
    try {
      await bucket.file(clip.audio.sourcePath).download({ destination: srcLocal });
      await transcodeToFlac(srcLocal, flacLocal);
      const durationMs = await probeDurationMs(flacLocal);
      const bytes = statSync(flacLocal).size;
      const corpusPath = `corpus/${clipId}/audio.flac`;
      await bucket.file(corpusPath).save(readFileSync(flacLocal), {
        contentType: "audio/flac",
        resumable: false,
      });

      await ref.update({
        status: "approved",
        "audio.path": corpusPath,
        "audio.durationMs": durationMs,
        "audio.sampleRate": 24000,
        "audio.channels": 1,
        "audio.codec": "flac",
        "audio.bytes": bytes,
        "review.reviewerId": request.auth?.token?.email ?? null,
        "review.reviewedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, clipId, durationMs };
    } finally {
      rmSync(srcLocal, { force: true });
      rmSync(flacLocal, { force: true });
    }
  }
);

// ── Reviewer-gated: reject ────────────────────────────────────────────────────
export const rejectClip = onCall(
  async (request: CallableRequest<{ clipId?: string; notes?: string }>) => {
    await assertReviewer(request);
    const clipId = request.data?.clipId;
    if (!clipId) throw new HttpsError("invalid-argument", "clipId required");
    await db.collection("clips").doc(clipId).update({
      status: "rejected",
      "review.reviewerId": request.auth?.token?.email ?? null,
      "review.reviewedAt": FieldValue.serverTimestamp(),
      "review.notes": request.data?.notes ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, clipId };
  }
);

// ── Reviewer-gated: list pending clips (for the review UI) ────────────────────
export const listPendingClips = onCall(async (request: CallableRequest<unknown>) => {
  await assertReviewer(request);
  const snap = await db.collection("clips").where("status", "==", "pending").limit(50).get();
  const clips = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return { clipId: x.clipId, promptId: x.promptId, transcript: x.transcript, english: x.english, speakerId: x.speakerId };
  });
  return { clips };
});

// ── Reviewer-gated: fetch a clip's raw audio (base64) for playback ────────────
export const getClipAudio = onCall(async (request: CallableRequest<{ clipId?: string }>) => {
  await assertReviewer(request);
  const clipId = request.data?.clipId;
  if (!clipId) throw new HttpsError("invalid-argument", "clipId required");
  const snap = await db.collection("clips").doc(clipId).get();
  if (!snap.exists) throw new HttpsError("not-found", "clip not found");
  const clip = snap.data() as { audio: { sourcePath: string; originalCodec: string } };
  const [buf] = await bucket.file(clip.audio.sourcePath).download();
  const ext = clip.audio.originalCodec || "webm";
  const contentType =
    ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : "audio/webm";
  return { base64: buf.toString("base64"), contentType };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function assertReviewer(request: CallableRequest<unknown>): Promise<void> {
  const email = request.auth?.token?.email;
  if (!email) throw new HttpsError("unauthenticated", "sign in required");
  const cfg = await db.doc("adminConfig/reviewers").get();
  const emails: string[] = cfg.exists ? cfg.data()?.emails ?? [] : [];
  if (!emails.includes(email)) throw new HttpsError("permission-denied", "not a reviewer");
}

interface Multipart {
  meta: string;
  audio: Buffer | null;
  mime: string;
}
function parseMultipart(headers: NodeJS.Dict<string | string[]>, rawBody: Buffer): Promise<Multipart> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
    const fields: Record<string, string> = {};
    let audio: Buffer | null = null;
    let mime = "";
    bb.on("field", (name, val) => (fields[name] = val));
    bb.on("file", (_name, stream, info) => {
      mime = info.mimeType;
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("close", () => (audio = Buffer.concat(chunks)));
    });
    bb.on("close", () => resolve({ meta: fields.meta ?? "{}", audio, mime }));
    bb.on("error", reject);
    bb.end(rawBody);
  });
}
