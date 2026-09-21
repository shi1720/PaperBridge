import { createHash } from "node:crypto";
import { getDb } from "./runtime";
import { HttpsError } from "firebase-functions/v2/https";

/** Shared by regular and AI handlers so alternate callable dispatch paths cannot skip limits. */
export async function rateLimit(uid: string, action: string): Promise<void> {
  const read =
    action.endsWith(".list") ||
    action.endsWith(".get") ||
    action.endsWith(".messages") ||
    action.endsWith(".comments");
  const max =
    action === "request.create" || action === "paper.upload"
      ? 12
      : action.startsWith("ai.")
        ? 20
        : read
          ? 180
          : 50;
  const now = Date.now();
  const key = createHash("sha256")
    .update(`${uid}:${action}:${Math.floor(now / 60_000)}`)
    .digest("hex");
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const ref = db.collection("rateLimits").doc(key);
    const previous = await tx.get(ref);
    const count = previous.data()?.count || 0;
    if (count >= max)
      throw new HttpsError(
        "resource-exhausted",
        "Please wait a minute before trying again.",
      );
    tx.set(ref, { count: count + 1, expiresAt: new Date(now + 3_600_000) });
  });
}
