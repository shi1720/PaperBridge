const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error("Media integration requires all three emulators.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const prefix = "media-" + Date.now().toString(36);
process.env.PAPERBRIDGE_DATABASE_ID = prefix;
process.env.APP_URL = "https://paperbridge.web.app";
const app = initializeApp({
  projectId: "demo-paperbridge",
  storageBucket: "demo-paperbridge.appspot.com",
});
const { getDb, getAppAuth, getPaperBucket } = require("../lib/runtime.js");
const { handleApi, deleteAccount } = require("../lib/api.js");
const {
  createMediaUpload,
  handleMediaUpload,
  purgeMedia,
} = require("../lib/media.js");
const db = getDb(),
  auth = getAppAuth(),
  bucket = getPaperBucket();
const owner = prefix + "-owner",
  other = prefix + "-other",
  erasable = prefix + "-erase";
const call = (uid, action, input = {}) =>
  handleApi(action, input, uid, {
    email_verified: true,
    auth_time: Date.now() / 1000,
  });
const profiles = new Map();
let image, pdf, token;
before(async () => {
  image = await sharp({
    create: { width: 100, height: 40, channels: 3, background: "#09f" },
  })
    .png()
    .toBuffer();
  pdf = Buffer.from("%PDF-1.4\nSynthetic fixture\n%%EOF");
  for (const uid of [owner, other, erasable]) {
    await auth.createUser({
      uid,
      email: uid + "@example.test",
      password: "TestPass123!",
      emailVerified: true,
    });
    const p = {
      name: uid,
      role: "researcher",
      categories: ["cs.AI"],
      publicProfile: true,
    };
    profiles.set(uid, p);
    await call(uid, "profile.save", { profile: p });
  }
  const login = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: owner + "@example.test",
        password: "TestPass123!",
        returnSecureToken: true,
      }),
    },
  );
  token = (await login.json()).idToken;
  assert.ok(token);
});
after(async () => {
  for (const uid of [owner, other, erasable]) {
    await bucket.deleteFiles({ prefix: `media/${uid}/`, force: true });
    await auth.deleteUser(uid).catch(() => {});
  }
  for (const collection of await db.listCollections())
    await db.recursiveDelete(collection);
  await deleteApp(app);
});
async function uploadHTTP(
  authToken = token,
  purpose = "community",
  body = image,
  type = "image/png",
) {
  const req = {
    method: "POST",
    query: { purpose, fileName: "figure.png" },
    rawBody: body,
    get(name) {
      return {
        authorization: authToken ? "Bearer " + authToken : undefined,
        "content-type": type,
        origin: "https://paperbridge.web.app",
      }[name];
    },
  };
  let status = 200,
    result;
  const res = {
    setHeader() {},
    status(n) {
      status = n;
      return this;
    },
    json(v) {
      result = v;
      return this;
    },
    send(v) {
      result = v;
      return this;
    },
  };
  await handleMediaUpload(req, res);
  return { status, result };
}
test("real tenant-aware upload checks authentication before storage and draft URLs are private/reusable", async () => {
  const before = (await db.collection("media").get()).size;
  assert.equal((await uploadHTTP("")).status, 401);
  assert.equal((await uploadHTTP("invalid")).status, 401);
  assert.equal((await db.collection("media").get()).size, before);
  const uploaded = await uploadHTTP();
  assert.equal(uploaded.status, 201);
  const m = uploaded.result.data;
  assert.equal(m.kind, "image");
  assert.equal(m.contentType, "image/webp");
  assert.equal(m.storagePath, undefined);
  assert.equal((await fetch(m.url)).status, 200);
  const refreshed = await call(owner, "media.get", { id: m.id });
  assert.equal(refreshed.url, m.url);
  await assert.rejects(
    call(other, "media.get", { id: m.id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(other, "media.remove", { id: m.id }),
    (e) => e.code === "not-found",
  );
  await call(owner, "media.remove", { id: m.id });
  assert.equal((await db.doc("media/" + m.id).get()).exists, false);
  assert.ok([403, 404].includes((await fetch(m.url)).status));
});
test("profile avatar claims enforce purpose/owner, current profile visibility, and remove replaced objects", async () => {
  const first = await createMediaUpload(
    owner,
    "avatar",
    "portrait.png",
    "image/png",
    image,
  );
  await assert.rejects(
    call(other, "profile.save", {
      profile: { ...profiles.get(other), avatarId: first.id },
    }),
    (e) => e.code === "permission-denied",
  );
  const saved = await call(owner, "profile.save", {
    profile: { ...profiles.get(owner), avatarId: first.id },
  });
  assert.ok(saved.avatarUrl);
  assert.ok((await call(other, "profile.get", { id: owner })).avatarUrl);
  await assert.rejects(
    call(owner, "media.remove", { id: first.id }),
    (e) => e.code === "failed-precondition",
  );
  await call(owner, "profile.save", {
    profile: { ...profiles.get(owner), publicProfile: false },
  });
  await assert.rejects(
    call(other, "media.get", { id: first.id }),
    (e) => e.code === "permission-denied",
  );
  const second = await createMediaUpload(
    owner,
    "avatar",
    "replacement.png",
    "image/png",
    image,
  );
  await call(owner, "profile.save", {
    profile: { ...profiles.get(owner), avatarId: second.id },
  });
  assert.equal((await db.doc("media/" + first.id).get()).exists, false);
  assert.ok([403, 404].includes((await fetch(first.url)).status));
  const community = await createMediaUpload(
    owner,
    "community",
    "wrong.png",
    "image/png",
    image,
  );
  await assert.rejects(
    call(owner, "profile.save", {
      profile: { ...profiles.get(owner), avatarId: community.id },
    }),
    (e) => e.code === "permission-denied",
  );
});
test("public post attachment access, editing, privacy, blocks, saving and deletion follow current content state", async () => {
  const m = await createMediaUpload(
    owner,
    "community",
    "research.pdf",
    "application/pdf",
    pdf,
  );
  const figure = await createMediaUpload(
    owner,
    "community",
    "figure.png",
    "image/png",
    image,
  );
  const post = await call(owner, "feed.post", {
    body: "Research question with two attachments",
    postType: "question",
    mediaIds: [m.id, figure.id],
  });
  assert.equal(post.attachments.length, 2);
  assert.equal(post.postType, "question");
  assert.ok(post.authorAvatarUrl);
  assert.equal(
    (await call(other, "feed.get", { id: post.id })).attachments.length,
    2,
  );
  await assert.rejects(
    call(other, "feed.post", { body: "Stolen", mediaIds: [m.id] }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(owner, "feed.post", { body: "Duplicate claim", mediaIds: [m.id] }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    call(other, "feed.edit", { id: post.id, body: "Overwrite" }),
    (e) => e.code === "permission-denied",
  );
  assert.deepEqual(await call(other, "feed.save", { id: post.id }), {
    saved: true,
  });
  assert.equal(
    (await call(other, "feed.list", { saved: true }))[0].id,
    post.id,
  );
  const edited = await call(owner, "feed.edit", {
    id: post.id,
    body: "Revised body",
    postType: "paper",
  });
  assert.equal(edited.attachments.length, 2);
  assert.equal(edited.postType, "paper");
  assert.ok(edited.editedAt);
  await call(owner, "feed.edit", { id: post.id, visibility: "private" });
  await assert.rejects(
    call(other, "media.get", { id: m.id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(other, "feed.get", { id: post.id }),
    (e) => e.code === "not-found",
  );
  assert.equal((await call(other, "feed.list", { saved: true })).length, 0);
  await call(owner, "feed.edit", { id: post.id, visibility: "public" });
  await call(other, "block.toggle", { userId: owner });
  await assert.rejects(
    call(other, "media.get", { id: m.id }),
    (e) => e.code === "permission-denied",
  );
  await call(other, "block.toggle", { userId: owner });
  await call(owner, "feed.edit", { id: post.id, mediaIds: [m.id] });
  assert.equal((await db.doc("media/" + figure.id).get()).exists, false);
  await call(owner, "feed.delete", { id: post.id });
  assert.equal((await db.doc("media/" + m.id).get()).exists, false);
  assert.equal((await call(other, "feed.list", { saved: true })).length, 0);
});
test("draft expiry, upload caps, deletion tombstones, metadata export and account cleanup retain no media objects", async () => {
  const expiring = await createMediaUpload(
    owner,
    "community",
    "expire.png",
    "image/png",
    image,
  );
  await db.doc("media/" + expiring.id).update({ cleanupAfter: 0 });
  assert.equal(await purgeMedia(expiring.id), true);
  await db
    .doc("mediaUsage/" + owner)
    .set({ day: new Date().toISOString().slice(0, 10), count: 40, bytes: 1 });
  await assert.rejects(
    createMediaUpload(owner, "community", "over.png", "image/png", image),
    (e) => e.code === "resource-exhausted",
  );
  const media = await createMediaUpload(
    erasable,
    "community",
    "owned.pdf",
    "application/pdf",
    pdf,
  );
  await call(erasable, "feed.post", {
    body: "Account cleanup",
    mediaIds: [media.id],
  });
  const exported = await call(erasable, "account.export");
  assert.equal(exported.media.length, 1);
  assert.equal(exported.media[0].url, undefined);
  await db.doc("deletionJobs/" + erasable).set({ status: "pending" });
  await assert.rejects(
    createMediaUpload(erasable, "community", "late.png", "image/png", image),
    (e) => e.code === "failed-precondition",
  );
  assert.equal(await deleteAccount(erasable), true);
  assert.equal(
    (await db.collection("media").where("ownerId", "==", erasable).get()).size,
    0,
  );
  assert.equal(
    (await bucket.getFiles({ prefix: `media/${erasable}/` }))[0].length,
    0,
  );
});
test("PDF metrics persist by revision, list responses omit page geometry, replacement without metrics clears stale observations", async () => {
  const metrics = {
    version: 1,
    totalPages: 2,
    scannedPages: 1,
    extractedCharacters: 12,
    textTruncated: true,
    pages: [
      {
        page: 1,
        width: 612,
        height: 792,
        textCharacters: 12,
        minFontSize: 8,
        medianFontSize: 12,
        textBounds: { left: -3, top: 10, right: 615, bottom: 794 },
      },
    ],
  };
  const paper = await call(owner, "paper.save", {
    paper: {
      title: "Metrics fixture",
      abstract: "A test abstract",
      category: "cs.AI",
      text: "hello world!",
      pdfAnalysis: metrics,
    },
  });
  const full = await call(owner, "paper.get", { id: paper.id });
  assert.deepEqual(full.pdfAnalysis, metrics);
  assert.deepEqual(full.versions[0].pdfAnalysis, metrics);
  const list = await call(owner, "paper.list");
  assert.equal(list[0].pdfAnalysis.pages, undefined);
  assert.equal(list[0].pdfAnalysis.totalPages, 2);
  const updated = await call(owner, "paper.save", {
    paper: { ...paper, text: "Changed extracted text", pdfAnalysis: undefined },
  });
  assert.equal(updated.pdfAnalysis, null);
  assert.deepEqual(updated.versions[0].pdfAnalysis, metrics);
});
