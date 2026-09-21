import { randomUUID } from "node:crypto";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { getDb, getAppAuth, getPaperBucket, assertAppTenant } from "./runtime";
import { withAccountLease } from "./lifecycle";
import { rateLimit } from "./rate-limit";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
type UploadRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  rawBody?: Buffer;
};
type UploadResponse = {
  setHeader(name: string, value: string): unknown;
  status(code: number): UploadResponse;
  json(body: unknown): unknown;
  send(body: string): unknown;
};
type UploadDependencies = {
  verifyToken(token: string): Promise<{ uid: string }>;
  lease<T>(uid: string, operation: () => Promise<T>): Promise<T>;
  limit(uid: string): Promise<void>;
  paper(id: string): Promise<{ ownerId: string; deleting?: boolean } | null>;
  save(path: string, body: Buffer): Promise<void>;
  uuid(): string;
  originAllowed(origin: string): boolean;
};
function validId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new HttpsError("invalid-argument", "Invalid manuscript identifier.");
  return value;
}
export function allowedUploadOrigin(origin: string): boolean {
  if (!origin) return true; // Non-browser clients still need the same bearer authentication.
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      if (origin === new URL(configured).origin) return true;
    } catch {}
  }
  return (
    process.env.FUNCTIONS_EMULATOR === "true" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}
export function createUploadHandler(dependencies: UploadDependencies) {
  return async (
    request: UploadRequest,
    response: UploadResponse,
  ): Promise<void> => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Vary", "Origin");
    const origin =
      typeof request.headers.origin === "string" ? request.headers.origin : "";
    if (!dependencies.originAllowed(origin)) {
      response.status(403).json({
        error: {
          code: "permission-denied",
          message: "This upload origin is not allowed.",
        },
      });
      return;
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST, OPTIONS");
      response.status(405).json({
        error: {
          code: "invalid-argument",
          message: "Use POST to upload a manuscript.",
        },
      });
      return;
    }
    try {
      const authorization = request.headers.authorization;
      const token =
        typeof authorization === "string"
          ? authorization.match(/^Bearer ([^\s]+)$/)?.[1]
          : undefined;
      if (!token)
        throw new HttpsError(
          "unauthenticated",
          "Sign in before uploading a manuscript.",
        );
      let identity;
      try {
        identity = await dependencies.verifyToken(token);
      } catch {
        throw new HttpsError(
          "unauthenticated",
          "Your sign-in is invalid or expired. Sign in again.",
        );
      }
      const uid = validId(identity.uid),
        paperId = validId(request.query.paperId);
      const fileName =
        typeof request.query.fileName === "string"
          ? request.query.fileName.trim()
          : "manuscript.pdf";
      if (
        !fileName ||
        fileName.length > 250 ||
        /[\x00-\x1f\x7f]/.test(fileName) ||
        !fileName.toLowerCase().endsWith(".pdf")
      )
        throw new HttpsError(
          "invalid-argument",
          "Choose a PDF with a valid filename.",
        );
      const contentType = request.headers["content-type"];
      if (
        typeof contentType !== "string" ||
        contentType.split(";")[0].trim().toLowerCase() !== "application/pdf" ||
        request.headers["content-encoding"]
      )
        throw new HttpsError(
          "invalid-argument",
          "Send the original PDF with application/pdf content type.",
        );
      const body = request.rawBody;
      if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_PDF_BYTES)
        throw new HttpsError(
          "invalid-argument",
          "Choose a PDF no larger than 20 MiB.",
        );
      if (!/^%PDF-\d\.\d/.test(body.subarray(0, 16).toString("ascii")))
        throw new HttpsError(
          "invalid-argument",
          "This file does not contain a valid PDF header.",
        );
      await dependencies.limit(uid);
      const result = await dependencies.lease(uid, async () => {
        const paper = await dependencies.paper(paperId);
        if (paper && (paper.ownerId !== uid || paper.deleting))
          throw new HttpsError(
            "permission-denied",
            "You cannot upload a revision to this manuscript.",
          );
        const storagePath = `papers/${uid}/${paperId}/${dependencies.uuid()}.pdf`;
        await dependencies.save(storagePath, body);
        return { id: paperId, storagePath, fileName, size: body.length };
      });
      response.status(201).json({ data: result });
    } catch (error) {
      const safe =
        error instanceof HttpsError
          ? error
          : new HttpsError(
              "internal",
              "The PDF could not be stored. Please try again.",
            );
      const status: Record<string, number> = {
        unauthenticated: 401,
        "permission-denied": 403,
        "invalid-argument": 400,
        "resource-exhausted": 429,
        "failed-precondition": 409,
      };
      response
        .status(status[safe.code] || 500)
        .json({ error: { code: safe.code, message: safe.message } });
    }
  };
}
export async function savePrivatePdf(
  file: { save(body: Buffer, options: any): Promise<unknown> },
  body: Buffer,
): Promise<void> {
  await file.save(body, {
    resumable: false,
    validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: {
      contentType: "application/pdf",
      cacheControl: "private, no-store, max-age=0",
      contentDisposition: "inline",
      metadata: {},
    },
  });
}
export const uploadManuscript = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    maxInstances: 2,
    concurrency: 4,
    cors: false,
  },
  createUploadHandler({
    async verifyToken(token) {
      const identity = await getAppAuth().verifyIdToken(token, true);
      assertAppTenant(identity);
      return identity;
    },
    lease: withAccountLease,
    limit: (uid) => rateLimit(uid, "paper.upload"),
    async paper(id) {
      const doc = await getDb().doc(`papers/${id}`).get();
      return doc.exists
        ? (doc.data() as { ownerId: string; deleting?: boolean })
        : null;
    },
    async save(storagePath, body) {
      await savePrivatePdf(getPaperBucket().file(storagePath), body);
    },
    uuid: randomUUID,
    originAllowed: allowedUploadOrigin,
  }),
);
