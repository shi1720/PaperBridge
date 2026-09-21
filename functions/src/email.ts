import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";

export const smtpPassword = defineSecret("SMTP_PASSWORD");
export const emailSecrets = [smtpPassword];
/** Delivery is tracked independently from the user-facing notification. Queueing never means sent. */
export async function deliverEmail(id: string): Promise<void> {
  return processEmailOutbox(getFirestore().doc(`emailOutbox/${id}`));
}
/** Core worker accepts a server-owned reference, enabling isolated tests without triggering delivery events. */
export async function processEmailOutbox(
  ref: DocumentReference,
): Promise<void> {
  const db = getFirestore();
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
    tx.update(ref, {
      status: "processing",
      lease,
      leaseExpiresAt: now + 120_000,
      updatedAt: now,
    });
    return j;
  });
  if (!job) return;
  try {
    const host = process.env.SMTP_HOST;
    const from = process.env.EMAIL_FROM;
    const password = smtpPassword.value();
    if (!host || !from || !password) {
      await ref.update({
        status: "queued",
        deliveryIssue:
          "Email delivery is awaiting administrator SMTP configuration.",
        leaseExpiresAt: 0,
        nextAttemptAt: now + 3_600_000,
        updatedAt: now,
      });
      return;
    }
    const port = Number(process.env.SMTP_PORT || "465");
    const transport = nodemailer.createTransport({
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
      text: job.body,
      messageId: `<${id}@paperbridge.app>`,
    });
    transport.close();
    if (!response.accepted?.length)
      throw new Error("The SMTP provider did not accept the recipient.");
    await ref.update({
      status: "sent",
      sentAt: Date.now(),
      providerMessageId: response.messageId,
      deliveryIssue: null,
      leaseExpiresAt: 0,
      updatedAt: Date.now(),
    });
  } catch {
    const attempts = (job.attempts || 0) + 1;
    // Provider errors can contain credentials or recipient details: never persist raw errors.
    await ref.update({
      status: attempts >= 8 ? "failed" : "queued",
      attempts,
      deliveryIssue:
        "The email provider could not accept this message. Delivery will be retried automatically.",
      leaseExpiresAt: 0,
      nextAttemptAt: now + Math.min(86_400_000, 60_000 * 2 ** attempts),
      updatedAt: Date.now(),
    });
  }
}
export const sendQueuedEmail = onDocumentCreated(
  {
    document: "emailOutbox/{id}",
    region: "us-central1",
    secrets: emailSecrets,
    retry: true,
  },
  (event) => deliverEmail(event.params.id),
);
export const retryQueuedEmail = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    secrets: emailSecrets,
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();
    for (const status of ["queued", "processing"]) {
      const jobs = await db
        .collection("emailOutbox")
        .where("status", "==", status)
        .where("nextAttemptAt", "<=", Date.now())
        .limit(100)
        .get();
      for (const job of jobs.docs) await deliverEmail(job.id);
    }
  },
);
