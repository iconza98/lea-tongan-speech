/**
 * Accept/transcode + moderation pipeline for the open Tongan speech corpus.
 *
 * ⚠️ UNTESTED SKELETON — written before the Firebase project exists. It compiles-shaped and follows
 *    the app's proven accept pattern, but has not been deployed or run. Stand up the project, set the
 *    bucket, `npm --prefix functions run typecheck`, then emulate before trusting it.
 *
 * Flow (data/schema.md + docs/adr/0001, 0002):
 *   site  ──POST multipart──▶  submitContribution  ──▶  submissions/{clipId}/source.<ext>
 *                                                        clips/{clipId} (status: pending)
 *   reviewer ──onCall──▶ acceptClip  ──transcode──▶  corpus/{clipId}/audio.flac (24k mono FLAC)
 *                                                     clips/{clipId} (status: approved)
 *   reviewer ──onCall──▶ rejectClip  ──▶  clips/{clipId} (status: rejected)
 */
import { onRequest, onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, statSync, rmSync } from "fs";
import Busboy from "busboy";
import { validateMeta, ValidationError } from "./lib/validateMeta";
import { transcodeToFlac, probeDurationMs } from "./lib/transcode";

admin.initializeApp();
const db = admin.firestore();
// TODO(project): the open-corpus bucket. Defaults to the project's bucket; override once known.
const bucket = admin.storage().bucket();

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
  { cors: true, memory: "256MiB" },
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

      const now = admin.firestore.FieldValue.serverTimestamp();
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
      await db.collection("speakers").doc(meta.speakerId).set(
        {
          speakerId: meta.speakerId,
          demographics: meta.demographics,
          consentVersion: meta.consent.version,
          clipCount: admin.firestore.FieldValue.increment(1),
          updatedAt: now,
        },
        { merge: true }
      );

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
        "review.reviewedAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      "review.reviewedAt": admin.firestore.FieldValue.serverTimestamp(),
      "review.notes": request.data?.notes ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, clipId };
  }
);

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
