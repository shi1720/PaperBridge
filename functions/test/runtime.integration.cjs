// Every fixture lives in its own emulator database; never reset another test's data.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Runtime isolation tests require Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const app = initializeApp({
  projectId: "demo-paperbridge",
  storageBucket: "default-other-app.test",
});
const envNames = [
  "PAPERBRIDGE_DATABASE_ID",
  "PAPERBRIDGE_AUTH_TENANT_ID",
  "PAPERBRIDGE_STORAGE_BUCKET",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
  "FUNCTIONS_EMULATOR",
];
const original = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
const suffix = Date.now().toString(36),
  uid = "isolation-" + suffix;
process.env.PAPERBRIDGE_DATABASE_ID = "isolation-" + suffix;
process.env.PAPERBRIDGE_AUTH_TENANT_ID = "paperbridge-test-tenant";
process.env.PAPERBRIDGE_STORAGE_BUCKET = "paperbridge-test-isolated-bucket";
const runtime = require("../lib/runtime.js");
const { handleApi } = require("../lib/api.js");
const isolated = runtime.getDb(),
  parentDb = getFirestore();
const claims = {
  email_verified: true,
  firebase: { tenant: "paperbridge-test-tenant" },
};
after(async () => {
  for (const db of [isolated, parentDb])
    await db.doc("profiles/" + uid).delete();
  for (const col of ["rateLimits", "operationLeases"]) {
    const docs = await isolated.collection(col).get();
    for (const doc of docs.docs) await doc.ref.delete();
  }
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await deleteApp(app);
});
test("rejects default and other tenants before creating rate limits, leases or writes", async () => {
  await isolated
    .doc("profiles/" + uid)
    .set({ displayName: "PaperBridge only" });
  await parentDb
    .doc("profiles/" + uid)
    .set({ displayName: "Unrelated app sentinel" });
  for (const token of [{}, { firebase: { tenant: "another-tenant" } }]) {
    await assert.rejects(
      handleApi("profile.get", {}, uid, token),
      (e) => e.code === "permission-denied",
    );
    await assert.rejects(
      handleApi("account.delete", {}, uid, token),
      (e) => e.code === "permission-denied",
    );
  }
  for (const col of ["rateLimits", "operationLeases", "deletionJobs"])
    assert.equal((await isolated.collection(col).get()).size, 0);
  assert.equal(
    (await parentDb.doc("profiles/" + uid).get()).data().displayName,
    "Unrelated app sentinel",
  );
  const profile = await handleApi("profile.get", {}, uid, claims);
  assert.equal(profile.displayName, "PaperBridge only");
  assert.equal(
    (await parentDb.doc("profiles/" + uid).get()).data().displayName,
    "Unrelated app sentinel",
  );
});
test("Auth administrative operations and storage signing select only configured tenant and bucket", () => {
  const auth = runtime.getAppAuth();
  assert.equal(auth.tenantId, "paperbridge-test-tenant");
  assert.notEqual(auth, getAuth());
  assert.equal(
    runtime.getPaperBucket().name,
    "paperbridge-test-isolated-bucket",
  );
  assert.equal(runtime.getDb().databaseId, "isolation-" + suffix);
});
test("missing production configuration fails closed instead of using parent default services", () => {
  const saved = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
  try {
    for (const name of envNames) delete process.env[name];
    for (const fn of [
      runtime.getDb,
      runtime.getAppAuth,
      runtime.getPaperBucket,
      () => runtime.assertAppTenant({}),
    ])
      assert.throws(fn, (e) => e.code === "failed-precondition");
    process.env.PAPERBRIDGE_DATABASE_ID = "(default)";
    assert.throws(runtime.getDb, (e) => e.code === "failed-precondition");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
