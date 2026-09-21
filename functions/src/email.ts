import { type DocumentReference } from "firebase-admin/firestore";
import { getDb, getDatabaseId } from "./runtime";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { renderEmail, EMAIL_LOGO_CID } from "./email-template";
import {
  emailLimits,
  MAX_EMAIL_ATTEMPTS,
  reserveEmailAttempt,
  senderMessageId,
} from "./email-budget";

export const smtpPassword = defineSecret("PAPERBRIDGE_SMTP_PASSWORD");
export const emailSecrets = [smtpPassword];
/** Delivery is tracked independently from the user-facing notification. Queueing never means sent. */
export async function deliverEmail(id: string): Promise<void> {
  return processEmailOutbox(getDb().doc(`emailOutbox/${id}`));
}
/** Core worker accepts a server-owned reference, enabling isolated tests without triggering delivery events. */
export async function processEmailOutbox(
  ref: DocumentReference,
): Promise<void> {
  const db = getDb();
  const id = ref.id;
  const now = Date.now();
  const lease = randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const j = snap.data();
    if (
      !j ||
      ["sent", "failed"].includes(j.status) ||
      (j.nextAttemptAt ?? 0) > now ||
      (j.leaseExpiresAt ?? 0) > now
    )
      return null;
    if ((j.attempts || 0) >= MAX_EMAIL_ATTEMPTS) {
      tx.update(ref, {
        status: "failed",
        deliveryIssue:
          "Email could not be confirmed after eight attempts. Administrator review is required.",
        leaseExpiresAt: 0,
        updatedAt: now,
      });
      return null;
    }
    tx.update(ref, {
      status: "processing",
      lease,
      leaseExpiresAt: now + 120_000,
      updatedAt: now,
    });
    return j;
  });
  if (!job) return;
  // A stale or deleted outbox entry must never be resurrected by a late worker.
  const finish = async (
    patch:
      Record<string, unknown> | ((current: any) => Record<string, unknown>),
  ) => {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const value = current.data();
      if (!value || value.lease !== lease || value.status !== "processing")
        return;
      tx.update(ref, typeof patch === "function" ? patch(value) : patch);
    });
  };
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const host = process.env.SMTP_HOST;
    const from = process.env.EMAIL_FROM;
    const password = smtpPassword.value();
    if (!host || !from || !password) {
      await finish({
        status: "queued",
        deliveryIssue:
          "Email delivery is awaiting administrator SMTP configuration.",
        deliveryCode: "configuration",
        leaseExpiresAt: 0,
        nextAttemptAt: now + 3_600_000,
        updatedAt: now,
      });
      return;
    }
    if (!(await reserveEmailAttempt(ref, lease, emailLimits()))) return;
    const port = Number(process.env.SMTP_PORT || "465");
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER || from, pass: password },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    // Message-ID is stable across retries. SMTP is at-least-once; recipients may rarely see duplicates after a worker crash.
    const response = await transport.sendMail({
      from,
      to: job.to,
      subject: job.subject,
      ...renderEmail(job as any),
      attachments: [
        {
          filename: "paperbridge-mark.png",
          path: join(__dirname, "../assets/paperbridge-mark.png"),
          cid: EMAIL_LOGO_CID,
          contentDisposition: "inline",
        },
      ],
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      messageId: senderMessageId(id, from),
    });
    if (!response.accepted?.length)
      throw new Error("The SMTP provider did not accept the recipient.");
    await finish({
      status: "sent",
      sentAt: Date.now(),
      providerMessageId: response.messageId,
      deliveryIssue: null,
      deliveryCode: null,
      leaseExpiresAt: 0,
      updatedAt: Date.now(),
    });
  } catch (error: unknown) {
    const smtpError = error as { code?: unknown; responseCode?: unknown };
    const providerErrorCode =
      typeof smtpError?.code === "string" &&
      [
        "EAUTH",
        "ESOCKET",
        "ETIMEDOUT",
        "ECONNECTION",
        "EENVELOPE",
        "EMESSAGE",
      ].includes(smtpError.code)
        ? smtpError.code
        : null;
    const providerResponseCode =
      typeof smtpError?.responseCode === "number" &&
      Number.isInteger(smtpError.responseCode) &&
      smtpError.responseCode >= 400 &&
      smtpError.responseCode <= 599
        ? smtpError.responseCode
        : null;
    // Provider errors can contain credentials or recipient details: never persist raw errors.
    await finish((current) => {
      const attempts = current.attempts || 0;
      const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
      return {
        status: exhausted ? "failed" : "queued",
        deliveryIssue: exhausted
          ? "Email could not be confirmed after eight attempts. Administrator review is required."
          : "The email provider could not confirm acceptance. Delivery will be retried automatically.",
        deliveryCode: exhausted ? "attempt_limit" : "provider_retry",
        providerErrorCode,
        providerResponseCode,
        leaseExpiresAt: 0,
        nextAttemptAt:
          Date.now() +
          Math.min(86_400_000, 60_000 * 2 ** Math.max(1, attempts)),
        updatedAt: Date.now(),
      };
    });
  } finally {
    // Also close connections on rejected recipients, authentication failures and timeouts.
    try {
      transport?.close();
    } catch {
      /* Cleanup errors do not change confirmed provider acceptance. */
    }
  }
}
export const sendQueuedEmail = onDocumentCreated(
  {
    document: "emailOutbox/{id}",
    database: getDatabaseId(),
    region: "us-central1",
    secrets: emailSecrets,
    retry: true,
    maxInstances: 2,
    concurrency: 4,
    timeoutSeconds: 60,
  },
  (event) => deliverEmail(event.params.id),
);
export const retryQueuedEmail = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    secrets: emailSecrets,
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const db = getDb();
    const deadline = Date.now() + 240_000;
    for (const status of ["queued", "processing"]) {
      const jobs = await db
        .collection("emailOutbox")
        .where("status", "==", status)
        .where("nextAttemptAt", "<=", Date.now())
        .limit(100)
        .get();
      for (const job of jobs.docs) {
        if (Date.now() > deadline) return;
        await deliverEmail(job.id);
      }
    }
  },
);
