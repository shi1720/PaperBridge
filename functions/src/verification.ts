import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { getDb, getAppAuth } from "./runtime";

const RESEND_COOLDOWN_MS = 60_000;
const DAILY_LIMIT = 10;

/** Caller must hold an account lease and pass the callable's tenant authentication gate. */
export async function queueVerificationEmail(uid: string) {
  const db = getDb();
  const auth = getAppAuth();
  const user = await auth.getUser(uid);
  if (user.disabled)
    throw new HttpsError("failed-precondition", "This account is unavailable.");
  if (user.emailVerified) return { queued: false, alreadyVerified: true };
  if (!user.email)
    throw new HttpsError(
      "failed-precondition",
      "This account has no email address to verify.",
    );
  const email = user.email;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const id = randomUUID();
  const limitRef = db.doc(`authEmailLimits/${uid}`);
  const deletionRef = db.doc(`deletionJobs/${uid}`);
  await db.runTransaction(async (tx) => {
    const [limit, deletion] = await Promise.all([
      tx.get(limitRef),
      tx.get(deletionRef),
    ]);
    if (deletion.exists)
      throw new HttpsError(
        "failed-precondition",
        "This account is being deleted.",
      );
    const previous = limit.data();
    if ((previous?.nextAllowedAt || 0) > now)
      throw new HttpsError(
        "resource-exhausted",
        "Please wait one minute before requesting another verification email.",
      );
    const count = previous?.day === day ? previous.count || 0 : 0;
    if (count >= DAILY_LIMIT)
      throw new HttpsError(
        "resource-exhausted",
        "The daily verification email limit has been reached. Try again tomorrow.",
      );
    tx.set(limitRef, {
      day,
      count: count + 1,
      nextAllowedAt: now + RESEND_COOLDOWN_MS,
      requestId: id,
      updatedAt: now,
    });
  });
  // Generate only for the current server-side account address. No client email or URL is accepted.
  let link: string;
  try {
    link = await auth.generateEmailVerificationLink(email, {
      url: process.env.APP_URL || "https://paperbridge.web.app",
      handleCodeInApp: false,
    });
  } catch {
    // Admin errors may contain an OOB code or recipient details. Never expose or log them.
    throw new HttpsError(
      "unavailable",
      "The verification email could not be prepared. Please try again in one minute.",
    );
  }
  const latest = await auth.getUser(uid);
  if (latest.disabled || latest.email !== email)
    throw new HttpsError(
      "failed-precondition",
      "Your account changed. Sign in again before requesting verification.",
    );
  if (latest.emailVerified) return { queued: false, alreadyVerified: true };
  await db.runTransaction(async (tx) => {
    const [deletion, reservation] = await Promise.all([
      tx.get(deletionRef),
      tx.get(limitRef),
    ]);
    if (deletion.exists)
      throw new HttpsError(
        "failed-precondition",
        "This account is being deleted.",
      );
    if (reservation.data()?.requestId !== id)
      throw new HttpsError(
        "aborted",
        "A newer verification request is already in progress.",
      );
    tx.create(db.doc(`emailOutbox/${id}`), {
      userId: uid,
      kind: "auth-verification",
      to: email,
      subject: "Verify your email for PaperBridge",
      body: `Welcome to PaperBridge.\n\nVerify your email address to request endorsements and collaborate with researchers:\n\n${link}\n\nIf you did not create this PaperBridge account, you can ignore this email.\n\nThe PaperBridge team`,
      presentation: {
        eyebrow: "WELCOME TO PAPERBRIDGE",
        heading: "Your next chapter starts here.",
        intro:
          "Verify your email address to start conversations, share your manuscript privately, and find support for your research.",
        actionLabel: "Verify email address",
        actionUrl: link,
        note: "If you didn’t create this account, you can safely ignore this email. Your manuscript is never attached to verification emails.",
      },
      status: "queued",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  return {
    queued: true,
    alreadyVerified: false,
    nextAllowedAt: now + RESEND_COOLDOWN_MS,
  };
}
