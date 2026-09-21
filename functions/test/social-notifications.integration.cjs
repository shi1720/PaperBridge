const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Social notification tests require Firestore emulator.");
process.env.PAPERBRIDGE_DATABASE_ID =
  "social-notifications-" + Date.now().toString(36);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const app = initializeApp({ projectId: "demo-paperbridge" });
const { getDb } = require("../lib/runtime.js");
const { handleApi } = require("../lib/api.js");
const db = getDb();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const call = (uid, action, input = {}) =>
  handleApi(action, input, uid, { email_verified: true });
const a = "researcher-a",
  b = "researcher-b",
  c = "researcher-c";
before(async () => {
  await Promise.all(
    [a, b, c].map((uid) =>
      db.doc("profiles/" + uid).set({
        id: uid,
        name: "Name " + uid,
        publicProfile: true,
        role: "researcher",
      }),
    ),
  );
});
after(async () => {
  for (const collection of await db.listCollections())
    await db.recursiveDelete(collection);
  await deleteApp(app);
});

test("follow and like notifications link to their subject without duplicating toggle activity", async () => {
  await call(a, "follow.toggle", { id: b });
  let notices = await call(b, "notifications.list");
  const follow = notices.find((notice) => notice.title === "New follower");
  assert.equal(follow.link, `/researchers/${a}`);
  assert.equal(follow.read, false);
  await call(b, "notifications.read", { id: follow.id });
  await call(a, "follow.toggle", { id: b });
  assert.equal(
    (await call(b, "notifications.list")).filter(
      (n) => n.title === "New follower",
    ).length,
    1,
  );
  await call(a, "follow.toggle", { id: b });
  notices = (await call(b, "notifications.list")).filter(
    (n) => n.title === "New follower",
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].read, false);
  await db.doc("posts/test-post").set({
    id: "test-post",
    authorId: b,
    body: "Research update",
    visibility: "public",
    likeCount: 0,
    createdAt: Date.now(),
  });
  await call(a, "feed.like", { id: "test-post" });
  await call(a, "feed.like", { id: "test-post" });
  await call(a, "feed.like", { id: "test-post" });
  const likes = (await call(b, "notifications.list")).filter(
    (n) => n.title === "New like",
  );
  assert.equal(likes.length, 1);
  assert.equal(likes[0].link, "/community#post-test-post");
  await call(b, "feed.like", { id: "test-post" });
  assert.equal(
    (await call(b, "notifications.list")).filter((n) => n.title === "New like")
      .length,
    1,
  );
});

test("individual reads enforce ownership; mark-all covers more than one batch and preserves new arrivals", async () => {
  const now = Date.now();
  let batch = db.batch();
  for (let i = 0; i < 451; i++)
    batch.set(db.doc(`notifications/batch-${i}`), {
      userId: c,
      title: "Notice",
      read: false,
      createdAt: now - i,
    });
  batch.set(db.doc("notifications/future"), {
    userId: c,
    title: "New arrival",
    read: false,
    createdAt: now + 60000,
  });
  await batch.commit();
  await assert.rejects(
    call(a, "notifications.read", { id: "batch-0" }),
    (error) => error.code === "not-found",
  );
  assert.equal(
    (await db.doc("notifications/batch-0").get()).data().read,
    false,
  );
  assert.deepEqual(await call(c, "notifications.read", { id: "batch-0" }), {
    updated: 1,
  });
  assert.deepEqual(await call(c, "notifications.read", { id: "batch-0" }), {
    updated: 0,
  });
  assert.equal((await call(c, "notifications.list")).length, 200);
  assert.deepEqual(await call(c, "notifications.read"), { updated: 450 });
  assert.equal((await db.doc("notifications/future").get()).data().read, false);
  assert.equal(
    (
      await db
        .collection("notifications")
        .where("userId", "==", c)
        .where("read", "==", false)
        .get()
    ).size,
    1,
  );
});

test("conversation reads only clear messages and alerts actually rendered, including concurrent sends", async () => {
  const chat = await call(a, "chat.open", { userId: b });
  assert.equal(chat.unreadCount, 0);
  assert.equal(chat.lastReadAt, 0);
  assert.equal(chat.unreadCounts, undefined);
  const one = await call(a, "chat.send", {
    id: chat.id,
    body: "First message",
  });
  const two = await call(a, "chat.send", {
    id: chat.id,
    body: "Second message",
  });
  assert.ok(two.createdAt > one.createdAt);
  let inbox = (await call(b, "chat.list")).find((item) => item.id === chat.id);
  assert.equal(inbox.unreadCount, 2);
  assert.equal(inbox.lastMessageAuthorId, a);
  await assert.rejects(
    call(c, "chat.read", { id: chat.id, through: two.createdAt }),
    (error) => error.code === "permission-denied",
  );
  const read = await call(b, "chat.read", {
    id: chat.id,
    through: one.createdAt,
  });
  assert.equal(read.unreadCount, 1);
  assert.equal(read.lastReadAt, one.createdAt);
  const notices = (await call(b, "notifications.list")).filter(
    (n) => n.link === `/messages?chat=${chat.id}`,
  );
  assert.equal(notices.find((n) => n.createdAt === one.createdAt).read, true);
  assert.equal(notices.find((n) => n.createdAt === two.createdAt).read, false);
  const [three] = await Promise.all([
    call(a, "chat.send", { id: chat.id, body: "Arriving during read" }),
    call(b, "chat.read", { id: chat.id, through: two.createdAt }),
  ]);
  inbox = (await call(b, "chat.list")).find((item) => item.id === chat.id);
  assert.equal(inbox.unreadCount, 1);
  assert.equal(inbox.lastReadAt, two.createdAt);
  await call(b, "chat.read", { id: chat.id, through: one.createdAt });
  inbox = (await call(b, "chat.list")).find((item) => item.id === chat.id);
  assert.equal(
    inbox.lastReadAt,
    two.createdAt,
    "an older tab cannot move read position backward",
  );
  await call(b, "chat.send", {
    id: chat.id,
    body: "A reply without reading the new message",
  });
  assert.equal(
    (await call(b, "chat.list")).find((item) => item.id === chat.id)
      .unreadCount,
    1,
  );
  const finalRead = await call(b, "chat.read", {
    id: chat.id,
    through: three.createdAt,
  });
  assert.equal(finalRead.unreadCount, 0);
  assert.equal(
    (await call(b, "notifications.list")).filter(
      (n) => n.link === `/messages?chat=${chat.id}` && !n.read,
    ).length,
    0,
  );
});

test("legacy conversation history migrates unread state and unavailable recipients reject sends", async () => {
  const chatId = "legacy-chat";
  await db.doc("chats/" + chatId).set({
    id: chatId,
    members: [a, c],
    names: { [a]: "A", [c]: "C" },
    lastMessage: "Old message",
    updatedAt: 10,
    createdAt: 1,
  });
  await db.doc("chatMessages/legacy-message").set({
    id: "legacy-message",
    chatId,
    authorId: a,
    body: "Old message",
    createdAt: 10,
  });
  assert.equal(
    (await call(c, "chat.list")).find((chat) => chat.id === chatId).unreadCount,
    1,
  );
  await call(a, "chat.send", { id: chatId, body: "A new message" });
  assert.equal(
    (await call(c, "chat.list")).find((chat) => chat.id === chatId).unreadCount,
    2,
  );
  assert.equal((await call(c, "chat.read", { id: chatId })).unreadCount, 0);
  await call(c, "block.toggle", { userId: a });
  await assert.rejects(
    call(a, "chat.send", { id: chatId, body: "Blocked" }),
    (error) => error.code === "permission-denied",
  );
  await assert.rejects(
    call(a, "chat.open", { userId: c }),
    (error) => error.code === "permission-denied",
  );
  await call(c, "block.toggle", { userId: a });
  await db.doc("deletionJobs/" + c).set({ status: "pending" });
  await assert.rejects(
    call(a, "chat.send", { id: chatId, body: "Deleted" }),
    (error) => error.code === "permission-denied",
  );
  await assert.rejects(
    call(a, "chat.open", { userId: c }),
    (error) => error.code === "permission-denied",
  );
  await db.doc("deletionJobs/" + c).delete();
  await db.doc("chats/" + chatId).update({ members: [a] });
  await assert.rejects(
    call(a, "chat.send", { id: chatId, body: "No recipient" }),
    (error) => error.code === "failed-precondition",
  );
  assert.equal(
    (await db.collection("chatMessages").where("chatId", "==", chatId).get())
      .size,
    2,
  );
});

test("shared manuscript notes notify only the request partner and private drafts stay silent", async () => {
  await db.doc("papers/notes-paper").set({
    id: "notes-paper",
    ownerId: a,
    title: "Careful research",
    version: 1,
    visibility: "private",
  });
  await db.doc("requests/notes-request").set({
    id: "notes-request",
    paperId: "notes-paper",
    requesterId: a,
    reviewerId: b,
    status: "accepted",
  });
  const notes = () =>
    db
      .collection("notifications")
      .where("link", "==", "/requests/notes-request")
      .get();
  const draft = await call(a, "annotation.save", {
    paperId: "notes-paper",
    requestId: "notes-request",
    page: 2,
    body: "A private draft",
    visibility: "private",
  });
  await call(a, "annotation.reply", {
    id: draft.id,
    body: "Private reasoning",
  });
  assert.equal((await notes()).size, 0);
  const shared = await call(a, "annotation.save", {
    ...draft,
    body: "Please check this",
    visibility: "shared",
  });
  assert.equal((await notes()).size, 1);
  assert.equal((await notes()).docs[0].data().userId, b);
  assert.equal((await notes()).docs[0].data().title, "New manuscript note");
  const { visibility, ...edit } = shared;
  const saved = await call(a, "annotation.save", {
    ...edit,
    body: "Please check this argument",
  });
  assert.equal(
    saved.visibility,
    "shared",
    "editing text must preserve shared scope",
  );
  assert.equal(
    (await notes()).size,
    1,
    "editing shared text does not generate duplicate alerts",
  );
  await call(b, "annotation.reply", {
    id: shared.id,
    body: "The revised claim is grounded.",
  });
  await call(a, "annotation.resolve", { id: shared.id, resolved: true });
  assert.equal((await notes()).size, 3);
  assert.ok(
    (await notes()).docs.some(
      (item) =>
        item.data().userId === a && item.data().title === "New note reply",
    ),
  );
  await call(a, "annotation.resolve", { id: shared.id, resolved: true });
  assert.equal(
    (await notes()).size,
    3,
    "repeated resolve requests do not create duplicate alerts",
  );
});

test("private drafts and blocked posts cannot hide older public feed pages", async () => {
  const now = Date.now() + 10000;
  const batch = db.batch();
  for (let i = 0; i < 120; i++) {
    batch.set(db.doc(`posts/hidden-private-${i}`), {
      authorId: b,
      body: "Private draft",
      visibility: "private",
      createdAt: now + 1000 + i,
    });
    batch.set(db.doc(`posts/hidden-blocked-${i}`), {
      authorId: c,
      body: "Blocked update",
      visibility: "public",
      createdAt: now + 2000 + i,
    });
  }
  batch.set(db.doc("posts/visible-older-a"), {
    authorId: a,
    body: "My older update",
    visibility: "public",
    createdAt: now + 1,
  });
  batch.set(db.doc("posts/visible-older-b"), {
    authorId: b,
    body: "Their older update",
    visibility: "public",
    createdAt: now + 2,
  });
  await batch.commit();
  await call(a, "block.toggle", { userId: c });
  const firstScan = await call(a, "feed.list", {
    limit: 2,
    includePageInfo: true,
  });
  assert.equal(
    firstScan.posts.length,
    0,
    "a scan of 200 hidden records returns continuation instead of scanning unbounded history",
  );
  assert.equal(firstScan.hasMore, true);
  assert.ok(firstScan.nextCursor);
  const nextScan = await call(a, "feed.list", {
    limit: 2,
    includePageInfo: true,
    cursor: firstScan.nextCursor,
  });
  const feed = nextScan.posts;
  assert.deepEqual(
    feed.map((post) => post.id),
    ["visible-older-b", "visible-older-a"],
  );
  for (const filter of [{ authorId: b }, { following: true }]) {
    const posts = await call(a, "feed.list", { ...filter, limit: 2 });
    assert.deepEqual(
      posts.map((post) => post.id),
      ["visible-older-b", "test-post"],
    );
  }
  const next = await call(a, "feed.list", {
    limit: 2,
    cursor: { createdAt: feed[1].createdAt, id: feed[1].id },
  });
  assert.equal(next[0].id, "test-post");
  assert.ok(next.every((post) => post.visibility === "public"));
});

test("bounded following pagination merges uneven author streams without losing or repeating posts", async () => {
  const reader = "multi-stream-reader";
  let batch = db.batch();
  for (let i = 0; i < 31; i++) {
    const followingId = `stream-author-${i}`;
    batch.set(db.doc("follows/" + hash(`${reader}:${followingId}`)), {
      followerId: reader,
      followingId,
      createdAt: 1,
    });
  }
  await batch.commit();
  const ordered = (
    await db
      .collection("follows")
      .where("followerId", "==", reader)
      .limit(300)
      .get()
  ).docs.map((item) => item.data().followingId);
  const dense = ordered[0],
    sparse = ordered[30],
    now = Date.now() + 100000;
  batch = db.batch();
  for (let i = 0; i < 230; i++)
    batch.set(db.doc(`posts/stream-private-${i}`), {
      authorId: sparse,
      body: "Private draft",
      visibility: "private",
      createdAt: now + 1000 + i,
    });
  for (const [id, authorId, createdAt] of [
    ["stream-public-first", dense, now + 500],
    ["stream-public-second", dense, now + 400],
    ["stream-public-third", sparse, now + 300],
  ])
    batch.set(db.doc("posts/" + id), {
      authorId,
      body: "Public discussion",
      visibility: "public",
      createdAt,
    });
  await batch.commit();
  const seen = [];
  let cursor;
  for (let index = 0; index < 5; index++) {
    const page = await call(reader, "feed.list", {
      following: true,
      limit: 2,
      includePageInfo: true,
      ...(cursor ? { cursor } : {}),
    });
    if (index === 0) {
      assert.equal(page.posts.length, 0);
      assert.equal(page.hasMore, true);
    }
    seen.push(...page.posts.map((post) => post.id));
    if (!page.hasMore) break;
    assert.ok(page.nextCursor);
    cursor = page.nextCursor;
  }
  assert.deepEqual(seen, [
    "stream-public-first",
    "stream-public-second",
    "stream-public-third",
  ]);
});

test("saved feed pages recover bookmarks beyond the newest hundred while preserving visibility and timestamp ties", async () => {
  const reader = "saved-pages-reader";
  const blockedAuthor = "saved-pages-blocked";
  const now = Date.now() + 200000;
  const batch = db.batch();
  const expected = [];
  batch.set(db.doc("blocks/" + hash(`${reader}:${blockedAuthor}`)), {
    ownerId: reader,
    targetId: blockedAuthor,
    createdAt: now,
  });
  for (let index = 0; index < 145; index++) {
    const id = "saved-page-" + String(index).padStart(3, "0");
    batch.set(db.doc("savedPosts/" + hash(`${reader}:${id}`)), {
      userId: reader,
      postId: id,
      // Bookmark order deliberately differs from post order. Limiting bookmarks
      // to 100 used to hide the 30 newest eligible discussions altogether.
      createdAt: now + 145 - index,
    });
    if (index >= 140 && index < 143) continue; // Removed posts remain bookmarked.
    batch.set(db.doc("posts/" + id), {
      authorId: index >= 143 ? blockedAuthor : b,
      body: "Saved discussion pagination fixture",
      visibility: index >= 130 && index < 140 ? "private" : "public",
      createdAt: now + Math.floor(index / 2),
    });
    if (index < 130) expected.push(id);
  }
  await batch.commit();
  const seen = [];
  let cursor;
  let exhausted = false;
  for (let index = 0; index < 10; index++) {
    const page = await call(reader, "feed.list", {
      saved: true,
      includePageInfo: true,
      limit: 25,
      ...(cursor ? { cursor } : {}),
    });
    assert.ok(
      page.posts.every(
        (post) =>
          post.saved &&
          post.visibility === "public" &&
          post.authorId !== blockedAuthor,
      ),
    );
    seen.push(...page.posts.map((post) => post.id));
    if (!page.hasMore) {
      assert.equal(page.nextCursor, null);
      exhausted = true;
      break;
    }
    assert.ok(page.nextCursor);
    assert.equal(page.nextCursor.id, page.posts[page.posts.length - 1].id);
    cursor = page.nextCursor;
  }
  assert.equal(exhausted, true);
  assert.equal(new Set(seen).size, 130);
  assert.deepEqual(seen, expected.reverse());
});
