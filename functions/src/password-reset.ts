import { createHmac, randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { getAppAuth, getDb } from "./runtime";
import { withAccountLease } from "./lifecycle";

const accepted = { accepted: true } as const;
/** Public recovery response never reveals whether the address has an account. */
export async function queuePasswordReset(
  input: unknown,
  ip: string,
  pepper: string,
) {
  if (
    typeof input !== "string" ||
    input.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
  )
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const email = input.trim().toLowerCase();
  const now = Date.now(),
    hour = Math.floor(now / 3_600_000);
  const fingerprint = (value: string) =>
    createHmac("sha256", pepper)
      .update(`password-reset:${value}`)
      .digest("hex");
  const db = getDb();
  // The same reservation applies to unknown addresses; limit state reveals no membership.
  const allowed = await db.runTransaction(async (tx) => {
    const ipRef = db.doc(
      `rateLimits/reset-ip-${fingerprint(ip || "unknown")}-${hour}`,
    );
    const emailRef = db.doc(
      `rateLimits/reset-email-${fingerprint(email)}-${hour}`,
    );
    const [source, recipient] = await Promise.all([
      tx.get(ipRef),
      tx.get(emailRef),
    ]);
    const count = source.data()?.count || 0;
    const target = recipient.data();
    if (
      count >= 10 ||
      (target?.count || 0) >= 3 ||
      (target?.nextAllowedAt || 0) > now
    )
      return false;
    const expiresAt = new Date(now + 7_200_000);
    tx.set(ipRef, { count: count + 1, expiresAt });
    tx.set(emailRef, {
      count: (target?.count || 0) + 1,
      nextAllowedAt: now + 60_000,
      expiresAt,
    });
    return true;
  });
  if (!allowed) return accepted;
  try {
    const auth = getAppAuth();
    const user = await auth.getUserByEmail(email);
    if (user.disabled || !user.email) return accepted;
    await withAccountLease(user.uid, async () => {
      const link = await auth.generatePasswordResetLink(user.email!, {
        url: process.env.APP_URL || "https://paperbridge.web.app",
        handleCodeInApp: false,
      });
      const current = await auth.getUser(user.uid);
      if (current.disabled || current.email !== user.email) return;
      await db.runTransaction(async (tx) => {
        if ((await tx.get(db.doc(`deletionJobs/${user.uid}`))).exists) return;
        tx.create(db.collection("emailOutbox").doc(randomUUID()), {
          userId: user.uid,
          kind: "auth-password-reset",
          to: user.email,
          subject: "Reset your PaperBridge password",
          body: `Reset your PaperBridge password\n\nUse this secure link to choose a new password:\n\n${link}\n\nIf you didn’t request a password reset, you can ignore this email. Your password will stay the same until you choose a new one.\n\nThe PaperBridge team`,
          presentation: {
            eyebrow: "YOUR PAPERBRIDGE ACCOUNT",
            heading: "Let’s get you back to your research.",
            intro:
              "We received a request to reset your password. Use the secure link below to choose a new one and return to your workspace.",
            actionLabel: "Reset password",
            actionUrl: link,
            note: "If you didn’t request this, you can safely ignore this email. Your password will stay the same until you choose a new one. Never share this link.",
          },
          status: "queued",
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        });
      });
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (
      ![
        "auth/user-not-found",
        "auth/user-disabled",
        "failed-precondition",
      ].includes(code || "")
    )
      console.error("Password recovery could not be queued.");
    // No address, existence signal, action link or provider error leaves this handler.
  }
  return accepted;
}
