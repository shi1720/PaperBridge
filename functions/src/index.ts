import { initializeApp } from "firebase-admin/app";
import { getDb, assertAppTenant } from "./runtime";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleApi, deleteAccount } from "./api";
import { DomainError } from "./domain";
import { withAccountLease } from "./lifecycle";
import { handleAI, aiEncryptionKey } from "./ai";
import { queuePasswordReset } from "./password-reset";
initializeApp();
export {
  sendQueuedEmail as paperbridgeSendQueuedEmail,
  retryQueuedEmail as paperbridgeRetryQueuedEmail,
} from "./email";
export { uploadManuscript as paperbridgeUploadManuscript } from "./uploads";
export {
  uploadMedia as paperbridgeUploadMedia,
  cleanupMedia as paperbridgeCleanupMedia,
} from "./media";
export const paperbridgeApi = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 20,
    secrets: [aiEncryptionKey],
  },
  async (request) => {
    if (request.data?.action === "auth.sendPasswordReset") {
      return {
        data: await queuePasswordReset(
          request.data.email,
          request.rawRequest.ip || "unknown",
          aiEncryptionKey.value(),
        ),
      };
    }
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Sign in to continue.");
    assertAppTenant(request.auth.token);
    const action = request.data?.action;
    if (typeof action !== "string" || action.length > 80)
      throw new HttpsError("invalid-argument", "Specify a valid action.");
    try {
      if ((await getDb().doc(`deletionJobs/${request.auth.uid}`).get()).exists)
        throw new HttpsError(
          "failed-precondition",
          "This account is being deleted or has been deleted.",
        );
      const result = action.startsWith("ai.")
        ? await withAccountLease(request.auth.uid, () =>
            handleAI(action, request.data, request.auth!.uid),
          )
        : await handleApi(
            action,
            request.data,
            request.auth.uid,
            request.auth.token,
          );
      return { data: result };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof DomainError)
        throw new HttpsError(error.code, error.message);
      // Do not serialize SDK/provider errors or secrets to clients or logs.
      console.error("Callable failure", {
        action,
        kind: error instanceof Error ? error.name : "unknown",
        code:
          typeof (error as { code?: unknown })?.code === "number" ||
          (typeof (error as { code?: unknown })?.code === "string" &&
            /^[a-z-]+\/[a-z-]+$/.test(
              String((error as { code?: unknown }).code),
            ))
            ? (error as { code: unknown }).code
            : undefined,
      });
      throw new HttpsError(
        "internal",
        "The operation could not finish. Please try again.",
      );
    }
  },
);
export const paperbridgeRetryAccountDeletion = onSchedule(
  { schedule: "every 60 minutes", region: "us-central1", timeoutSeconds: 540 },
  async () => {
    const jobs = await getDb()
      .collection("deletionJobs")
      .where("status", "==", "pending")
      .limit(20)
      .get();
    for (const job of jobs.docs) {
      try {
        await deleteAccount(job.id);
      } catch {
        await job.ref.set(
          { updatedAt: Date.now(), lastIssue: "Deletion will be retried." },
          { merge: true },
        );
      }
    }
  },
);
