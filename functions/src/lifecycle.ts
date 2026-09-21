import { getDb } from "./runtime";
import { HttpsError } from "firebase-functions/v2/https";
/** A deletion tombstone and a lease are read/written in the same transaction.
 * Deletion cannot purge until every earlier operation finishes (or its function timeout expires).
 * This covers long AI provider calls as well as short social/profile writes. */
export async function withAccountLease<T>(
  uid: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  const db = getDb();
  const ref = db.collection("operationLeases").doc();
  await db.runTransaction(async (tx) => {
    const tombstone = await tx.get(db.doc(`deletionJobs/${uid}`));
    if (tombstone.exists)
      throw new HttpsError(
        "failed-precondition",
        "This account is being deleted or has been deleted.",
      );
    tx.create(ref, { ownerId: uid, expiresAt: Date.now() + 600_000 });
  });
  try {
    return await operation();
  } finally {
    await ref.delete();
  }
}
