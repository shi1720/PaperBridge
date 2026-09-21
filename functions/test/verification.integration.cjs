const { test, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Verification tests require Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const app = initializeApp({ projectId: "demo-paperbridge" });
process.env.PAPERBRIDGE_DATABASE_ID = "verification-" + Date.now().toString(36);
process.env.PAPERBRIDGE_AUTH_TENANT_ID = "verification-tenant";
process.env.APP_URL = "https://paperbridge.web.app";
const { getDb, getAppAuth } = require("../lib/runtime.js");
const { handleApi } = require("../lib/api.js");
const db = getDb(),
  auth = getAppAuth();
const originalGetUser = auth.getUser,
  originalLink = auth.generateEmailVerificationLink;
const users = new Map();
let linkCalls = 0;
let linkHook;
auth.getUser = async (uid) => {
  if (!users.has(uid)) throw new Error("Unknown fixture");
  return users.get(uid);
};
auth.generateEmailVerificationLink = async (email, settings) => {
  linkCalls++;
  assert.equal(auth.tenantId, "verification-tenant");
  assert.deepEqual(settings, {
    url: "https://paperbridge.web.app",
    handleCodeInApp: false,
  });
  if (linkHook) await linkHook();
  return (
    "https://demo-paperbridge.firebaseapp.com/__/auth/action?oobCode=PRIVATE-VERIFICATION-CODE&email=" +
    encodeURIComponent(email)
  );
};
const call = (
  uid,
  input = {},
  token = { firebase: { tenant: "verification-tenant" } },
) => handleApi("auth.sendVerification", input, uid, token);
const seed = (uid, extra = {}) =>
  users.set(uid, {
    uid,
    email: uid + "@example.test",
    emailVerified: false,
    disabled: false,
    ...extra,
  });
const queue = (uid) =>
  db.collection("emailOutbox").where("userId", "==", uid).get();
after(async () => {
  auth.getUser = originalGetUser;
  auth.generateEmailVerificationLink = originalLink;
  for (const collection of [
    "emailOutbox",
    "authEmailLimits",
    "deletionJobs",
    "rateLimits",
    "operationLeases",
  ])
    await db.recursiveDelete(db.collection(collection));
  await deleteApp(app);
});
test("signed-in onboarding queues branded private mail for actual account address without requiring a profile", async () => {
  const uid = "onboarding";
  seed(uid);
  const result = await call(uid, {
    email: "attacker@example.test",
    continueUrl: "https://attacker.test",
  });
  assert.equal(result.queued, true);
  assert.equal(result.alreadyVerified, false);
  assert.ok(result.nextAllowedAt > Date.now());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("oobCode"), false);
  assert.equal(serialized.includes("@"), false);
  assert.equal((await db.doc("profiles/" + uid).get()).exists, false);
  const docs = await queue(uid);
  assert.equal(docs.size, 1);
  const job = docs.docs[0].data();
  assert.equal(job.to, uid + "@example.test");
  assert.equal(job.subject, "Verify your email for PaperBridge");
  assert.equal(job.kind, "auth-verification");
  assert.equal(job.status, "queued");
  assert.match(job.body, /PRIVATE-VERIFICATION-CODE/);
  assert.equal(job.body.includes("attacker"), false);
  assert.equal((await db.collection("notifications").get()).size, 0);
});
test("concurrent resend requests generate one link and one message, with a ten-per-day cap", async () => {
  const uid = "concurrent";
  seed(uid);
  const before = linkCalls;
  const results = await Promise.allSettled([call(uid), call(uid), call(uid)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const result of results.filter((r) => r.status === "rejected"))
    assert.equal(result.reason.code, "resource-exhausted");
  assert.equal(linkCalls - before, 1);
  assert.equal((await queue(uid)).size, 1);
  await db
    .doc("authEmailLimits/" + uid)
    .update({ count: 10, nextAllowedAt: 0 });
  await assert.rejects(call(uid), (e) => e.code === "resource-exhausted");
  assert.equal(linkCalls - before, 1);
  await db
    .doc("authEmailLimits/" + uid)
    .update({ day: "2000-01-01", nextAllowedAt: 0 });
  assert.equal((await call(uid)).queued, true);
  assert.equal((await db.doc("authEmailLimits/" + uid).get()).data().count, 1);
});
test("verified, disabled, deleted and foreign-tenant accounts cannot send verification mail", async () => {
  seed("verified", { emailVerified: true });
  assert.deepEqual(await call("verified"), {
    queued: false,
    alreadyVerified: true,
  });
  seed("disabled", { disabled: true });
  await assert.rejects(
    call("disabled"),
    (e) => e.code === "failed-precondition",
  );
  seed("deleted");
  await db.doc("deletionJobs/deleted").set({ status: "pending" });
  await assert.rejects(
    call("deleted"),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    call("foreign", {}, {}),
    (e) => e.code === "permission-denied",
  );
  for (const uid of ["verified", "disabled", "deleted", "foreign"])
    assert.equal((await queue(uid)).size, 0);
});
test("deletion during link generation and changed account address prevent outbox creation", async () => {
  seed("during-delete");
  linkHook = () =>
    db.doc("deletionJobs/during-delete").set({ status: "pending" });
  await assert.rejects(
    call("during-delete"),
    (e) => e.code === "failed-precondition",
  );
  assert.equal((await queue("during-delete")).size, 0);
  seed("changed-address");
  linkHook = () => {
    users.get("changed-address").email = "changed@example.test";
  };
  await assert.rejects(
    call("changed-address"),
    (e) => e.code === "failed-precondition",
  );
  assert.equal((await queue("changed-address")).size, 0);
  linkHook = undefined;
});
test("provider errors are redacted and cannot leak verification codes or email addresses", async () => {
  seed("failure");
  linkHook = () => {
    throw new Error("PRIVATE-VERIFICATION-CODE secret@example.test");
  };
  await assert.rejects(
    call("failure"),
    (e) =>
      e.code === "unavailable" &&
      !e.message.includes("PRIVATE") &&
      !e.message.includes("@"),
  );
  assert.equal((await queue("failure")).size, 0);
  linkHook = undefined;
});
