import { getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
// This module is imported before any function is defined, including scheduled and Storage handlers.
const serviceAccount = process.env.PAPERBRIDGE_SERVICE_ACCOUNT?.trim();
if (
  serviceAccount &&
  process.env.FUNCTIONS_EMULATOR !== "true" &&
  !process.env.FIRESTORE_EMULATOR_HOST
)
  setGlobalOptions({ serviceAccount });

function configured(name: string): string {
  return process.env[name]?.trim() || "";
}
function demoEmulator(): boolean {
  const project =
    getApp().options.projectId || process.env.GCLOUD_PROJECT || "";
  return (
    project.startsWith("demo-") &&
    !!(
      process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FUNCTIONS_EMULATOR === "true"
    )
  );
}
function unavailable(): never {
  throw new HttpsError(
    "failed-precondition",
    "PaperBridge isolated service configuration is incomplete.",
  );
}
/** Never let a missing production setting fall back into an existing app's default database. */
export function getDatabaseId(): string {
  const id = configured("PAPERBRIDGE_DATABASE_ID");
  if (id && (id !== "(default)" || process.env.FIRESTORE_EMULATOR_HOST))
    return id;
  if (!id && process.env.FIRESTORE_EMULATOR_HOST) return "(default)";
  return unavailable();
}
export function getDb() {
  return getFirestore(getDatabaseId());
}
/** A configured tenant always wins, including in emulator tests. No parent-auth fallback. */
export function getAppAuth() {
  const tenant = configured("PAPERBRIDGE_AUTH_TENANT_ID");
  if (tenant) return getAuth().tenantManager().authForTenant(tenant);
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && demoEmulator())
    return getAuth();
  return unavailable();
}
export function getPaperBucket() {
  const bucket = configured("PAPERBRIDGE_STORAGE_BUCKET");
  if (bucket) return getStorage().bucket(bucket);
  if (
    (process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST) &&
    demoEmulator()
  )
    return getStorage().bucket();
  return unavailable();
}
/** Run before any database, lease, rate-limit, key or manuscript operation. */
export function assertAppTenant(
  token: { firebase?: { tenant?: string } } | undefined,
): void {
  const expected = configured("PAPERBRIDGE_AUTH_TENANT_ID");
  const actual = token?.firebase?.tenant;
  if (expected) {
    if (actual !== expected)
      throw new HttpsError(
        "permission-denied",
        "Sign in through the PaperBridge account workspace.",
      );
    return;
  }
  if (!demoEmulator()) unavailable();
  if (actual)
    throw new HttpsError(
      "permission-denied",
      "This sign-in belongs to a different account workspace.",
    );
}
