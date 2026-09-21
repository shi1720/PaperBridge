const { test, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Requires emulator");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const app = initializeApp({ projectId: "demo-paperbridge" });
process.env.PAPERBRIDGE_DATABASE_ID = "reset-" + Date.now().toString(36);
process.env.PAPERBRIDGE_AUTH_TENANT_ID = "reset-tenant";
process.env.APP_URL = "https://paperbridge.web.app";
const { getDb, getAppAuth } = require("../lib/runtime.js");
const { queuePasswordReset } = require("../lib/password-reset.js");
const db = getDb(),
  auth = getAppAuth();
const original = {
  lookup: auth.getUserByEmail,
  get: auth.getUser,
  link: auth.generatePasswordResetLink,
};
const users = new Map();
let linkHook;
auth.getUserByEmail = async (email) => {
  const user = users.get(email);
  if (!user)
    throw Object.assign(Error("private@example.test"), {
      code: "auth/user-not-found",
    });
  return { ...user };
};
auth.getUser = async (uid) => ({
  ...[...users.values()].find((u) => u.uid === uid),
});
auth.generatePasswordResetLink = async (email, settings) => {
  assert.equal(auth.tenantId, "reset-tenant");
  assert.equal(settings.url, "https://paperbridge.web.app");
  if (linkHook) await linkHook();
  return "https://demo-paperbridge.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=PRIVATE-CODE";
};
const seed = (id, extra = {}) => {
  const u = { uid: id, email: id + "@example.test", disabled: false, ...extra };
  users.set(u.email, u);
  return u;
};
const call = (email, ip = "source") =>
  queuePasswordReset(
    email,
    ip,
    "test-pepper-with-at-least-thirty-two-characters",
  );
const jobs = (uid) =>
  db.collection("emailOutbox").where("userId", "==", uid).get();
after(async () => {
  auth.getUserByEmail = original.lookup;
  auth.getUser = original.get;
  auth.generatePasswordResetLink = original.link;
  for (const name of [
    "rateLimits",
    "emailOutbox",
    "operationLeases",
    "deletionJobs",
  ])
    await db.recursiveDelete(db.collection(name));
  await deleteApp(app);
});
test("known and unknown addresses have identical responses; reset links stay private in the isolated outbox", async () => {
  const u = seed("known");
  assert.deepEqual(
    await call("KNOWN@example.test"),
    await call("unknown@example.test"),
  );
  const j = (await jobs(u.uid)).docs[0].data();
  assert.equal(j.kind, "auth-password-reset");
  assert.equal(j.to, u.email);
  assert.equal(j.presentation.actionLabel, "Reset password");
  assert.match(j.body, /PRIVATE-CODE/);
  assert.equal((await db.collection("notifications").get()).size, 0);
  const limits = await db.collection("rateLimits").get();
  assert.ok(
    limits.docs.every(
      (d) => !JSON.stringify({ id: d.id, data: d.data() }).includes("@"),
    ),
  );
});
test("concurrent recovery requests generate one message; per-address cooldown and hourly cap stay generic", async () => {
  const existing = new Set(
    (await db.collection("rateLimits").get()).docs.map((d) => d.id),
  );
  const u = seed("concurrent");
  const results = await Promise.all(
    Array.from({ length: 4 }, () => call(u.email, "concurrent-source")),
  );
  assert.ok(results.every((r) => r.accepted === true));
  assert.equal((await jobs(u.uid)).size, 1);
  const docs = await db.collection("rateLimits").get();
  const target = docs.docs.find(
    (d) => d.id.startsWith("reset-email-") && !existing.has(d.id),
  );
  assert.ok(target);
  await target.ref.update({ count: 3, nextAllowedAt: 0 });
  assert.deepEqual(await call(u.email, "other-source"), { accepted: true });
  assert.equal((await jobs(u.uid)).size, 1);
});
test("an IP cannot request recovery for more than ten addresses per hour", async () => {
  for (let i = 0; i < 11; i++) seed("limited-" + i);
  for (let i = 0; i < 11; i++)
    assert.deepEqual(
      await call("limited-" + i + "@example.test", "limited-source"),
      { accepted: true },
    );
  assert.equal((await jobs("limited-10")).size, 0);
  assert.equal((await jobs("limited-9")).size, 1);
});
test("disabled accounts and deletion/address changes during link generation do not queue email", async () => {
  const disabled = seed("disabled", { disabled: true });
  await call(disabled.email, "s-disabled");
  assert.equal((await jobs("disabled")).size, 0);
  const deleted = seed("deleted");
  linkHook = () => db.doc("deletionJobs/deleted").set({ status: "pending" });
  await call(deleted.email, "s-delete");
  assert.equal((await jobs("deleted")).size, 0);
  const changed = seed("changed");
  linkHook = () => {
    changed.email = "replacement@example.test";
  };
  await call("changed@example.test", "s-change");
  assert.equal((await jobs("changed")).size, 0);
  linkHook = undefined;
});
test("invalid input is rejected; provider failures do not expose account existence or secret links", async () => {
  for (const value of [
    undefined,
    "not-an-email",
    "bad\r\n@example.test",
    "x".repeat(255),
  ])
    await assert.rejects(call(value), (e) => e.code === "invalid-argument");
  seed("failure");
  linkHook = () => {
    throw Error("PRIVATE-CODE secret@example.test");
  };
  assert.deepEqual(await call("failure@example.test", "s-failure"), {
    accepted: true,
  });
  assert.equal((await jobs("failure")).size, 0);
  linkHook = undefined;
});
