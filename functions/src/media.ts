import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Transaction, FieldValue } from "firebase-admin/firestore";
import { getDb, getAppAuth, getPaperBucket, assertAppTenant } from "./runtime";
import { withAccountLease } from "./lifecycle";
import { rateLimit } from "./rate-limit";
import { allowedUploadOrigin } from "./uploads";
import { identifier, text, DomainError } from "./domain";

export const MEDIA_LIMITS = {
  avatar: 5 * 1024 * 1024,
  image: 8 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
};
const DAY = 86_400_000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export type MediaPurpose = "avatar" | "community";
const invalid = (message: string): never => {
  throw new HttpsError("invalid-argument", message);
};

/** Fully decode accepted images, then create a fresh single-frame WebP without source metadata. */
export async function normalizeMedia(
  body: Buffer,
  contentType: string,
  purpose: MediaPurpose,
) {
  if (!Buffer.isBuffer(body) || !body.length)
    invalid("Choose a file to upload.");
  if (purpose !== "avatar" && purpose !== "community")
    invalid("Choose a valid upload purpose.");
  if (contentType === "application/pdf" && purpose === "community") {
    if (body.length > MEDIA_LIMITS.pdf)
      invalid("Community PDFs must be 20 MiB or smaller.");
    if (
      !/^%PDF-\d\.\d/.test(body.subarray(0, 16).toString("ascii")) ||
      !body.subarray(-2048).includes(Buffer.from("%%EOF"))
    )
      invalid("Choose a complete PDF file.");
    // PDFs are untrusted downloadable documents, never reclassified as sanitized images.
    return {
      body,
      contentType: "application/pdf",
      kind: "pdf",
      width: null,
      height: null,
    };
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
    invalid("Choose a JPEG, PNG or WebP image, or a community PDF.");
  if (
    body.length >
    (purpose === "avatar" ? MEDIA_LIMITS.avatar : MEDIA_LIMITS.image)
  )
    invalid(
      purpose === "avatar"
        ? "Profile photos must be 5 MiB or smaller."
        : "Community images must be 8 MiB or smaller.",
    );
  try {
    const options = {
      limitInputPixels: 20_000_000,
      failOn: "error" as const,
      sequentialRead: true,
    };
    const metadata = await sharp(body, options).metadata();
    const formats: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    if (
      !metadata.format ||
      formats[metadata.format] !== contentType ||
      (metadata.pages || 1) !== 1
    )
      invalid(
        "Choose a still JPEG, PNG or WebP image with the correct file type.",
      );
    const resized = sharp(body, options)
      .rotate()
      .resize(
        purpose === "avatar"
          ? {
              width: 512,
              height: 512,
              fit: "cover",
              position: "attention",
              withoutEnlargement: false,
            }
          : {
              width: 2048,
              height: 2048,
              fit: "inside",
              withoutEnlargement: true,
            },
      );
    const output = await resized
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return {
      body: output.data,
      contentType: "image/webp",
      kind: "image",
      width: output.info.width,
      height: output.info.height,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    return invalid(
      "This image could not be safely decoded. Choose a different file under 20 megapixels.",
    );
  }
}
function metadataDTO(media: any) {
  return {
    id: media.id,
    purpose: media.purpose,
    kind: media.kind,
    fileName: media.fileName,
    size: media.size,
    contentType: media.contentType,
    width: media.width ?? null,
    height: media.height ?? null,
  };
}
async function mediaUrl(media: any): Promise<string> {
  const file = getPaperBucket().file(media.storagePath);
  if (
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
    process.env.STORAGE_EMULATOR_HOST
  ) {
    // Emulator-only bearer token download. Production always uses expiring signed URLs.
    const [metadata] = await file.getMetadata();
    const existing = metadata.metadata?.firebaseStorageDownloadTokens;
    const token =
      typeof existing === "string" && existing ? existing : randomUUID();
    if (!existing)
      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token },
      });
    const host = (
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST ||
      ""
    ).replace(/^https?:\/\//, "");
    return `http://${host}/v0/b/${getPaperBucket().name}/o/${encodeURIComponent(media.storagePath)}?alt=media&token=${token}`;
  }
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 600_000,
    responseDisposition: media.kind === "pdf" ? "attachment" : "inline",
  });
  return url;
}
export async function readableMedia(id: string, uid: string): Promise<any> {
  const snap = await getDb()
    .doc(`media/${identifier(id)}`)
    .get();
  const media = snap.data();
  if (!media || ["uploading", "deleting"].includes(media.status))
    throw new HttpsError("not-found", "This attachment is unavailable.");
  if (media.ownerId !== uid) {
    const [a, b, deleted] = await getDb().getAll(
      getDb().doc(`blocks/${hash(`${uid}:${media.ownerId}`)}`),
      getDb().doc(`blocks/${hash(`${media.ownerId}:${uid}`)}`),
      getDb().doc(`deletionJobs/${media.ownerId}`),
    );
    if (a.exists || b.exists || deleted.exists || media.status !== "claimed")
      throw new HttpsError("permission-denied", "This attachment is private.");
    const parent = await getDb()
      .doc(
        media.claimType === "profile"
          ? `profiles/${media.ownerId}`
          : `posts/${media.claimId}`,
      )
      .get();
    const value = parent.data();
    if (
      !value ||
      (media.claimType === "profile"
        ? !value.publicProfile || value.avatarId !== id
        : value.deleting ||
          value.visibility === "private" ||
          !(value.mediaIds || []).includes(id))
    )
      throw new HttpsError("permission-denied", "This attachment is private.");
  } else if (media.status === "draft" && media.cleanupAfter <= Date.now())
    throw new HttpsError("not-found", "This draft attachment has expired.");
  return {
    ...metadataDTO({ ...media, id }),
    url: await mediaUrl(media),
    expiresAt: Date.now() + 600_000,
  };
}
export async function avatarUrl(
  ownerId: string,
  viewerId: string,
): Promise<string | null> {
  const profile = (await getDb().doc(`profiles/${ownerId}`).get()).data();
  if (!profile?.avatarId || (viewerId !== ownerId && !profile.publicProfile))
    return null;
  try {
    return (await readableMedia(profile.avatarId, viewerId)).url;
  } catch (e) {
    if (
      e instanceof HttpsError &&
      ["not-found", "permission-denied"].includes(e.code)
    )
      return null;
    throw e;
  }
}
export function mediaIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 4)
    invalid("Attach up to four images or PDFs.");
  const result = (value as unknown[]).map((value) => identifier(value));
  if (new Set(result).size !== result.length)
    invalid("Each attachment may appear only once.");
  return result;
}
/** Performs reads only. Invoke before any transaction writes, then use returned apply function. */
export async function prepareMediaClaim(
  tx: Transaction,
  ownerId: string,
  ids: string[],
  previousIds: string[],
  claimType: "profile" | "post",
  claimId: string,
) {
  const db = getDb();
  const all = [...new Set([...ids, ...previousIds])];
  const refs = all.map((id) => db.doc(`media/${id}`));
  const snapshots = refs.length ? await tx.getAll(...refs) : [];
  const byId = new Map(snapshots.map((s) => [s.id, s.data()]));
  for (const id of ids) {
    const m = byId.get(id);
    if (
      !m ||
      m.ownerId !== ownerId ||
      m.purpose !== (claimType === "profile" ? "avatar" : "community") ||
      (claimType === "profile" && m.kind !== "image") ||
      !["draft", "claimed"].includes(m.status)
    )
      throw new HttpsError(
        "permission-denied",
        "Choose one of your own matching uploaded attachments.",
      );
    if (
      m.status === "claimed" &&
      (m.claimType !== claimType || m.claimId !== claimId)
    )
      throw new HttpsError(
        "failed-precondition",
        "This attachment is already used elsewhere. Upload a separate copy.",
      );
    if (m.status === "draft" && m.cleanupAfter <= Date.now())
      throw new HttpsError(
        "failed-precondition",
        "This draft expired. Upload the file again.",
      );
  }
  return () => {
    const now = Date.now();
    for (const id of ids)
      tx.update(db.doc(`media/${id}`), {
        status: "claimed",
        claimType,
        claimId,
        cleanupAfter: FieldValue.delete(),
        updatedAt: now,
      });
    for (const id of previousIds.filter((id) => !ids.includes(id))) {
      const m = byId.get(id);
      if (
        m?.ownerId === ownerId &&
        m.claimType === claimType &&
        m.claimId === claimId
      )
        tx.update(db.doc(`media/${id}`), {
          status: "deleting",
          cleanupAfter: now,
          updatedAt: now,
        });
    }
  };
}
export async function purgeMedia(id: string): Promise<boolean> {
  const db = getDb(),
    ref = db.doc(`media/${id}`);
  const m = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref),
      value = snap.data();
    if (
      !value ||
      value.status === "claimed" ||
      !(
        typeof value.cleanupAfter === "number" &&
        value.cleanupAfter <= Date.now()
      )
    )
      return null;
    tx.update(ref, { status: "deleting", cleanupAfter: Date.now() });
    return value;
  });
  if (!m) return false;
  await getPaperBucket().file(m.storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  return true;
}
export async function removeMediaDraft(id: string, uid: string) {
  const ref = getDb().doc(`media/${identifier(id)}`);
  await getDb().runTransaction(async (tx) => {
    const m = (await tx.get(ref)).data();
    if (!m || m.ownerId !== uid)
      throw new HttpsError("not-found", "This upload was not found.");
    if (!["draft", "deleting"].includes(m.status))
      throw new HttpsError(
        "failed-precondition",
        "Remove this attachment from its post or profile first.",
      );
    tx.update(ref, { status: "deleting", cleanupAfter: Date.now() });
  });
  await purgeMedia(id);
  return { removed: true };
}
export async function createMediaUpload(
  uid: string,
  purpose: MediaPurpose,
  fileName: string,
  contentType: string,
  body: Buffer,
) {
  if (purpose !== "avatar" && purpose !== "community")
    invalid("Choose a valid upload purpose.");
  const max =
    purpose === "avatar"
      ? MEDIA_LIMITS.avatar
      : contentType === "application/pdf"
        ? MEDIA_LIMITS.pdf
        : MEDIA_LIMITS.image;
  if (!Buffer.isBuffer(body) || !body.length || body.length > max)
    invalid("This file exceeds the upload size limit.");
  const kind = contentType === "application/pdf" ? "pdf" : "image";
  const name = text(fileName, "File name", 180).replace(
    /[\x00-\x1f\x7f/\\]/g,
    "_",
  );
  const id = randomUUID(),
    now = Date.now(),
    db = getDb();
  const storagePath = `media/${uid}/${id}.${kind === "pdf" ? "pdf" : "webp"}`;
  const ref = db.doc(`media/${id}`),
    usageRef = db.doc(`mediaUsage/${uid}`);
  const m = {
    id,
    ownerId: uid,
    purpose,
    kind,
    fileName: name,
    contentType,
    size: body.length,
    width: null,
    height: null,
    storagePath,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
    cleanupAfter: now + 3_600_000,
  };
  await db.runTransaction(async (tx) => {
    const [usage, deleted] = await Promise.all([
      tx.get(usageRef),
      tx.get(db.doc(`deletionJobs/${uid}`)),
    ]);
    if (deleted.exists)
      throw new HttpsError(
        "failed-precondition",
        "This account is being deleted.",
      );
    const day = new Date(now).toISOString().slice(0, 10),
      previous = usage.data();
    const count = previous?.day === day ? previous.count || 0 : 0,
      bytes = previous?.day === day ? previous.bytes || 0 : 0;
    if (count >= 40 || bytes + body.length > 100 * 1024 * 1024)
      throw new HttpsError(
        "resource-exhausted",
        "The daily upload allowance is 40 files or 100 MiB. Try again tomorrow.",
      );
    tx.set(usageRef, { day, count: count + 1, bytes: bytes + body.length });
    tx.create(ref, m);
  });
  try {
    // Reserve the daily allowance before invoking the image decoder.
    const normal = await normalizeMedia(body, contentType, purpose);
    await getPaperBucket()
      .file(storagePath)
      .save(normal.body, {
        resumable: false,
        validation: "crc32c",
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: normal.contentType,
          contentDisposition: normal.kind === "pdf" ? "attachment" : "inline",
          cacheControl: "private, no-store, max-age=0",
          metadata: {},
        },
      });
    await ref.update({
      kind: normal.kind,
      contentType: normal.contentType,
      size: normal.body.length,
      width: normal.width,
      height: normal.height,
      status: "draft",
      cleanupAfter: now + DAY,
      updatedAt: Date.now(),
    });
    return await readableMedia(id, uid);
  } catch (error) {
    await ref
      .update({ status: "deleting", cleanupAfter: Date.now() })
      .catch(() => {});
    await purgeMedia(id).catch(() => {});
    throw error;
  }
}
export async function handleMediaUpload(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  const origin = req.get("origin") || "";
  if (!allowedUploadOrigin(origin)) {
    res.status(403).json({
      error: {
        code: "permission-denied",
        message: "This upload origin is not allowed.",
      },
    });
    return;
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({
      error: {
        code: "invalid-argument",
        message: "Use POST to upload media.",
      },
    });
    return;
  }
  try {
    const bearer = req.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!bearer)
      throw new HttpsError("unauthenticated", "Sign in before uploading.");
    let identity;
    try {
      identity = await getAppAuth().verifyIdToken(bearer, true);
      assertAppTenant(identity);
    } catch {
      throw new HttpsError(
        "unauthenticated",
        "Your sign-in has expired. Sign in again.",
      );
    }
    if (req.get("content-encoding"))
      invalid("Upload the original uncompressed file.");
    await rateLimit(identity.uid, "media.upload");
    const result = await withAccountLease(identity.uid, () =>
      createMediaUpload(
        identity.uid,
        req.query.purpose as MediaPurpose,
        String(req.query.fileName || "attachment"),
        (req.get("content-type") || "").split(";")[0].trim().toLowerCase(),
        req.rawBody,
      ),
    );
    res.status(201).json({ data: result });
  } catch (error) {
    const safe =
      error instanceof HttpsError
        ? error
        : error instanceof DomainError
          ? new HttpsError(error.code, error.message)
          : new HttpsError(
              "internal",
              "The upload could not finish. Try again.",
            );
    const status: Record<string, number> = {
      unauthenticated: 401,
      "permission-denied": 403,
      "invalid-argument": 400,
      "resource-exhausted": 429,
      "failed-precondition": 409,
    };
    res
      .status(status[safe.code] || 500)
      .json({ error: { code: safe.code, message: safe.message } });
  }
}
export const uploadMedia = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    maxInstances: 2,
    concurrency: 2,
    cors: false,
  },
  handleMediaUpload,
);
export const cleanupMedia = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "us-central1",
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const pending = await getDb()
      .collection("media")
      .where("cleanupAfter", "<=", Date.now())
      .limit(200)
      .get();
    for (const item of pending.docs) {
      try {
        await purgeMedia(item.id);
      } catch {
        /* Retained tombstone retries on the next run; no provider data is logged. */
      }
    }
  },
);
