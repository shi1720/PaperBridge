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

const { createHash } = require("node:crypto");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const socialRefs = new Set();
const seedSocial = async (path, value) => {
  socialRefs.add(path);
  await db.doc(path).set(value);
};
after(async () => {
  for (const path of socialRefs) await db.doc(path).delete();
  // Notifications/comments/chats use generated IDs and only these uniquely named participants.
  for (const [collection, field] of [
    ["notifications", "userId"],
    ["postComments", "authorId"],
    ["chatMessages", "authorId"],
  ]) {
    for (const uid of [a, b]) {
      const found = await db
        .collection(collection)
        .where(field, "==", uid)
        .get();
      for (const doc of found.docs) await doc.ref.delete();
    }
  }
  const chats = await db
    .collection("chats")
    .where("members", "array-contains", a)
    .get();
  for (const doc of chats.docs) await doc.ref.delete();
  await deleteApp(app);
});
test("researcher directory includes ordinary researchers and endorsers, filters category/search/blocks and excludes private profiles", async () => {
  const ordinary = prefix + "-ordinary",
    endorser = prefix + "-endorser",
    privateId = prefix + "-private",
    blocked = prefix + "-blocked",
    wrongCategory = prefix + "-math";
  for (const [id, role, publicProfile, categories] of [
    [ordinary, "researcher", true, ["cs.AI"]],
    [endorser, "endorser", true, ["cs.AI"]],
    [privateId, "researcher", false, ["cs.AI"]],
    [blocked, "researcher", true, ["cs.AI"]],
    [wrongCategory, "researcher", true, ["math.AG"]],
  ])
    await seedSocial("profiles/" + id, {
      id,
      name: id,
      role,
      publicProfile,
      categories,
      email: "must-not-leak@example.test",
    });
  await seedSocial("blocks/" + hash(`${blocked}:${a}`), {
    ownerId: blocked,
    targetId: a,
  });
  const all = await call(a, "directory.list", {
    scope: "researchers",
    category: "cs.AI",
    search: prefix,
  });
  const ids = new Set(all.map((p) => p.id));
  assert.ok(ids.has(ordinary));
  assert.ok(ids.has(endorser));
  for (const hidden of [privateId, blocked, wrongCategory])
    assert.equal(ids.has(hidden), false);
  assert.ok(all.every((p) => p.email === undefined));
  const defaults = await call(a, "directory.list", {
    category: "cs.AI",
    search: prefix,
  });
  assert.ok(defaults.some((p) => p.id === endorser));
  assert.equal(
    defaults.some((p) => p.id === ordinary),
    false,
  );
  await assert.rejects(
    call(a, "directory.list", { scope: "private" }),
    (e) => e.code === "invalid-argument",
  );
});
test("following feed retrieves older followed posts beyond the latest 100 unrelated and pages timestamp ties across author batches", async () => {
  const oldPost = prefix + "-old-followed";
  for (let i = 0; i < 31; i++) {
    const author = prefix + "-followed-" + i;
    await seedSocial("follows/" + hash(`${a}:${author}`), {
      followerId: a,
      followingId: author,
      createdAt: i,
    });
  }
  const base = Date.now();
  const batch = db.batch();
  for (let i = 0; i < 105; i++) {
    const path = "posts/" + prefix + "-unrelated-" + i;
    socialRefs.add(path);
    batch.set(db.doc(path), {
      authorId: prefix + "-unrelated-author",
      body: "Global traffic",
      createdAt: base + i,
    });
  }
  await batch.commit();
  await seedSocial("posts/" + oldPost, {
    authorId: prefix + "-followed-30",
    body: "Older relevant post",
    createdAt: 1,
    likedBy: ["private-like-user"],
  });
  for (const suffix of ["a", "b", "c"])
    await seedSocial("posts/" + prefix + "-tie-" + suffix, {
      authorId: prefix + "-followed-" + (suffix === "c" ? 30 : 0),
      body: "Tied posts",
      createdAt: 100,
    });
  await seedSocial("likes/" + hash(`${a}:${oldPost}`), {
    userId: a,
    postId: oldPost,
  });
  const feed = await call(a, "feed.list", { following: true });
  assert.equal(feed.length, 4);
  assert.ok(feed.some((p) => p.id === oldPost && p.liked));
  assert.ok(feed.every((p) => p.likedBy === undefined));
  const first = await call(a, "feed.list", { following: true, limit: 2 });
  assert.deepEqual(
    first.map((p) => p.id),
    [prefix + "-tie-c", prefix + "-tie-b"],
  );
  const second = await call(a, "feed.list", {
    following: true,
    limit: 2,
    cursor: { id: first[1].id, createdAt: first[1].createdAt },
  });
  assert.deepEqual(
    second.map((p) => p.id),
    [prefix + "-tie-a", oldPost],
  );
  const empty = await call(prefix + "-no-follows", "feed.list", {
    following: true,
  });
  assert.deepEqual(empty, []);
  await seedSocial("blocks/" + hash(`${prefix + "-followed-30"}:${a}`), {
    ownerId: prefix + "-followed-30",
    targetId: a,
  });
  const next = await call(a, "feed.list", { following: true });
  assert.equal(
    next.some((p) => p.id === oldPost || p.id === prefix + "-tie-c"),
    false,
  );
});
test("unfollow survives private or removed profiles and creation enforces the 300-follow cap", async () => {
  const follower = prefix + "-capped",
    target = prefix + "-new-follow";
  await seedSocial("profiles/" + target, {
    name: target,
    publicProfile: true,
    role: "researcher",
  });
  const batch = db.batch();
  for (let i = 0; i < 300; i++) {
    const path = "follows/" + hash(`${follower}:${prefix + "-cap-" + i}`);
    socialRefs.add(path);
    batch.set(db.doc(path), {
      followerId: follower,
      followingId: prefix + "-cap-" + i,
      createdAt: i,
    });
  }
  await batch.commit();
  await assert.rejects(
    call(follower, "follow.toggle", { id: target }),
    (e) => e.code === "resource-exhausted",
  );
  const existing = prefix + "-cap-0";
  await seedSocial("profiles/" + existing, { publicProfile: false });
  assert.deepEqual(await call(follower, "follow.toggle", { id: existing }), {
    following: false,
  });
  await assert.rejects(
    call(follower, "follow.toggle", { id: existing }),
    (e) => e.code === "permission-denied",
  );
  assert.deepEqual(await call(follower, "follow.toggle", { id: target }), {
    following: true,
  });
  socialRefs.add("follows/" + hash(`${follower}:${target}`));
  await db.doc("profiles/" + target).delete();
  assert.deepEqual(await call(follower, "follow.toggle", { id: target }), {
    following: false,
  });
});
test("focused post lookup is public but block-aware, and social notifications link to actual discussion routes", async () => {
  const id = prefix + "-targeted-post";
  await seedSocial("posts/" + id, {
    authorId: b,
    body: "Find my old discussion",
    createdAt: 1,
    likedBy: ["private-user"],
    commentCount: 0,
  });
  const stranger = prefix + "-stranger";
  const post = await call(stranger, "feed.get", { id });
  assert.equal(post.id, id);
  assert.equal(post.likedBy, undefined);
  assert.equal(post.liked, false);
  await seedSocial("blocks/" + hash(`${b}:${stranger}`), {
    ownerId: b,
    targetId: stranger,
  });
  await assert.rejects(
    call(stranger, "feed.get", { id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(a, "feed.get", { id: prefix + "-missing-post" }),
    (e) => e.code === "not-found",
  );
  await call(a, "feed.comment", { id, body: "Notification target test" });
  const chat = await call(a, "chat.open", { userId: b });
  await call(a, "chat.send", { id: chat.id, body: "Message target test" });
  const notices = await call(b, "notifications.list");
  assert.ok(notices.some((n) => n.link === `/community#post-${id}`));
  assert.ok(notices.some((n) => n.link === `/messages?chat=${chat.id}`));
});
