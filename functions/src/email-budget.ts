import { createHash } from "node:crypto";
import { type DocumentReference } from "firebase-admin/firestore";
import { getDb } from "./runtime";

export const MAX_EMAIL_ATTEMPTS = 8;
export type EmailLimits = { hourly: number; daily: number; monthly: number };
export function emailLimits(env: NodeJS.ProcessEnv = process.env): EmailLimits {
  const value = (name: string, fallback: number) => {
    const n = Number(env[name]);
    return env[name] !== undefined &&
      env[name]!.trim() !== "" &&
      Number.isSafeInteger(n) &&
      n >= 0 &&
      n <= 1_000_000
      ? n
      : fallback;
  };
  return {
    hourly: value("EMAIL_HOURLY_LIMIT", 50),
    daily: value("EMAIL_DAILY_LIMIT", 250),
    monthly: value("EMAIL_MONTHLY_LIMIT", 7000),
  };
}
export function emailWindows(now: number, limits: EmailLimits) {
  const date = new Date(now);
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return [
    { kind: "hour", start: hour, end: hour + 3_600_000, limit: limits.hourly },
    { kind: "day", start: day, end: day + 86_400_000, limit: limits.daily },
    {
      kind: "month",
      start: month,
      end: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
      limit: limits.monthly,
    },
  ];
}
export function senderMessageId(id: string, from: string): string {
  const domain =
    from.match(/@([a-z0-9.-]+)(?:>|\s|$)/i)?.[1]?.toLowerCase() || "localhost";
  return `<${id}@${domain}>`;
}
/** Reserve one SMTP attempt atomically across all workers. Retries count conservatively too.
 * Production has one fixed scope (emailOutbox); internal fixture collections cannot consume its quota. */
export async function reserveEmailAttempt(
  ref: DocumentReference,
  lease: string,
  limits: EmailLimits,
  now = Date.now(),
): Promise<boolean> {
  const db = getDb();
  const scope = ref.parent.path;
  const windows = emailWindows(now, limits);
  const counters = windows.map((w) =>
    db
      .collection("emailBudgets")
      .doc(
        createHash("sha256")
          .update(`${scope}:${w.kind}:${w.start}`)
          .digest("hex"),
      ),
  );
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const job = current.data();
    if (!job || job.lease !== lease || job.status !== "processing")
      return false;
    if ((job.attempts || 0) >= MAX_EMAIL_ATTEMPTS) {
      tx.update(ref, {
        status: "failed",
        deliveryIssue:
          "Email could not be confirmed after eight attempts. Administrator review is required.",
        leaseExpiresAt: 0,
        updatedAt: now,
      });
      return false;
    }
    const counts = await Promise.all(
      counters.map((counter) => tx.get(counter)),
    );
    const blocked = windows.filter(
      (w, i) => (counts[i].data()?.count || 0) >= w.limit,
    );
    if (blocked.length) {
      tx.update(ref, {
        status: "queued",
        deliveryIssue:
          "Email is queued until the application sending allowance resets.",
        deliveryCode: "sending_allowance",
        leaseExpiresAt: 0,
        nextAttemptAt: Math.max(...blocked.map((w) => w.end)) + 1000,
        updatedAt: now,
      });
      return false;
    }
    windows.forEach((w, i) =>
      tx.set(counters[i], {
        scope,
        window: w.kind,
        start: w.start,
        end: w.end,
        count: (counts[i].data()?.count || 0) + 1,
        expiresAt: new Date(w.end + 7 * 86_400_000),
      }),
    );
    tx.update(ref, {
      attempts: (job.attempts || 0) + 1,
      attemptedAt: now,
      leaseExpiresAt: now + 120_000,
      deliveryCode: null,
    });
    return true;
  });
}
