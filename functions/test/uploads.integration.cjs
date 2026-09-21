// Real HTTP/Auth/Firestore/Storage integration; uniquely scoped fixtures, never production.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Emulator environment is required.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const app = initializeApp({
    projectId: "demo-paperbridge",
    storageBucket: "demo-paperbridge.appspot.com",
  }),
  db = getFirestore(),
  auth = getAuth();
const uid = "upload-http-" + crypto.randomUUID(),
  paperId = "paper-" + crypto.randomUUID(),
  password = crypto.randomBytes(16).toString("base64url");
const pdf = Buffer.from("%PDF-1.4\nFictional HTTP upload fixture\n%%EOF");
let token;
const endpoint =
  "http://127.0.0.1:5001/demo-paperbridge/us-central1/paperbridgeUploadManuscript";
const upload = (body = pdf, options = {}) =>
  fetch(
    endpoint +
      "?" +
      new URLSearchParams({ paperId, fileName: "draft.pdf", ...options.query }),
    {
      method: "POST",
      headers: {
        "content-type": options.type || "application/pdf",
        ...(options.anonymous ? {} : { authorization: "Bearer " + token }),
      },
      body,
    },
  );
before(async () => {
  await auth.createUser({
    uid,
    email: uid + "@example.test",
    password,
    emailVerified: true,
  });
  await db.doc("papers/" + paperId).set({
    ownerId: uid,
    title: "HTTP test manuscript",
    visibility: "private",
  });
  const signed = await fetch(
    "http://" +
      process.env.FIREBASE_AUTH_EMULATOR_HOST +
      "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: uid + "@example.test",
        password,
        returnSecureToken: true,
      }),
    },
  );
  token = (await signed.json()).idToken;
  assert.ok(token);
});
after(async () => {
  await db.doc("deletionJobs/" + uid).delete();
  await db.doc("papers/" + paperId).delete();
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `papers/${uid}/`, force: true });
  const leases = await db
    .collection("operationLeases")
    .where("ownerId", "==", uid)
    .get();
  await Promise.all(leases.docs.map((d) => d.ref.delete()));
  await auth.deleteUser(uid);
  await deleteApp(app);
});
test("real upload endpoint rejects anonymous, wrong-owner and non-PDF requests", async () => {
  assert.equal((await upload(pdf, { anonymous: true })).status, 401);
  assert.equal(
    (await upload(Buffer.from("<html>not a PDF</html>"))).status,
    400,
  );
  assert.equal((await upload(pdf, { type: "text/html" })).status, 400);
  await db.doc("papers/" + paperId).update({ ownerId: "someone-else" });
  try {
    assert.equal((await upload()).status, 403);
  } finally {
    await db.doc("papers/" + paperId).update({ ownerId: uid });
  }
});
test("real authenticated uploads choose unique immutable private paths with no long-lived Firebase token", async () => {
  const first = await upload();
  assert.equal(first.status, 201);
  const a = (await first.json()).data;
  assert.equal(a.id, paperId);
  assert.match(
    a.storagePath,
    new RegExp(`^papers/${uid}/${paperId}/[a-f0-9-]+\\.pdf$`),
  );
  assert.equal(a.size, pdf.length);
  const second = await upload();
  assert.equal(second.status, 201);
  const b = (await second.json()).data;
  assert.notEqual(a.storagePath, b.storagePath);
  const file = getStorage().bucket().file(a.storagePath);
  const [metadata] = await file.getMetadata();
  assert.equal(metadata.metadata?.firebaseStorageDownloadTokens, undefined);
  assert.match(metadata.cacheControl, /no-store/);
  const [bytes] = await file.download();
  assert.deepEqual(bytes, pdf);
  const direct = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST}/v0/b/demo-paperbridge.appspot.com/o/${encodeURIComponent(a.storagePath)}?alt=media`,
  );
  assert.equal(direct.status, 403);
});
test("account deletion tombstone rejects later uploads without creating another object", async () => {
  const [before] = await getStorage()
    .bucket()
    .getFiles({ prefix: `papers/${uid}/` });
  await db.doc("deletionJobs/" + uid).set({ status: "pending" });
  const response = await upload();
  assert.equal(response.status, 409);
  const [after] = await getStorage()
    .bucket()
    .getFiles({ prefix: `papers/${uid}/` });
  assert.equal(after.length, before.length);
});
