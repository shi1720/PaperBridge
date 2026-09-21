// Targeted, nondestructive checks: creates/removes only uniquely namespaced test records.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("This test requires Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-paperbridge" });
const db = getFirestore();
const { handleApi } = require("../lib/api.js");
const prefix = "hardening-" + Date.now();
const a = prefix + "-a",
  b = prefix + "-b";
const call = (uid, action, input = {}) =>
  handleApi(action, input, uid, { email_verified: true });
after(async () => {
  for (const uid of [a, b]) {
    for (const field of ["followerId", "followingId"]) {
      const records = await db
        .collection("follows")
        .where(field, "==", uid)
        .get();
      for (const record of records.docs) await record.ref.delete();
    }
    await db.doc("profiles/" + uid).delete();
  }
  await deleteApp(app);
});
test("own missing profile returns null for onboarding while unrelated missing profile stays not-found", async () => {
  assert.equal(await call(a, "profile.get"), null);
  assert.equal(await call(a, "profile.get", { id: a }), null);
  await assert.rejects(
    call(a, "profile.get", { id: b }),
    (e) => e.code === "not-found",
  );
});
test("two-way follows expose directional records compatible with the Following feed", async () => {
  for (const id of [a, b])
    await db
      .doc("profiles/" + id)
      .set({ id, name: id, role: "researcher", publicProfile: true });
  assert.deepEqual(await call(a, "follow.list"), {
    following: [],
    followers: [],
  });
  assert.deepEqual(await call(a, "follow.toggle", { id: b }), {
    following: true,
  });
  await call(b, "follow.toggle", { id: a });
  const mine = await call(a, "follow.list");
  assert.equal(mine.following.length, 1);
  assert.equal(mine.followers.length, 1);
  assert.equal(mine.following[0].followerId, a);
  assert.equal(mine.following[0].followingId, b);
  assert.ok(mine.following[0].id);
  assert.equal(mine.followers[0].followerId, b);
  assert.equal(mine.followers[0].followingId, a);
  // Same mapping consumed by Social.tsx, rather than assuming an array of raw IDs.
  const followedIds = new Set(
    mine.following.map((record) => record.followingId),
  );
  assert.equal(followedIds.has(b), true);
  assert.equal(followedIds.has(a), false);
  assert.deepEqual(await call(a, "follow.toggle", { id: b }), {
    following: false,
  });
  const next = await call(a, "follow.list");
  assert.equal(next.following.length, 0);
  assert.equal(next.followers.length, 1);
});
