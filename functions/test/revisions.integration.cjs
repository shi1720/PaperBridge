// Nondestructive integration test: only uniquely namespaced fixture records are removed.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error(
    "Revision tests require Auth, Firestore and Storage emulators.",
  );
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { getAuth } = require("firebase-admin/auth");
const { createHash } = require("node:crypto");
const projectId = "demo-paperbridge";
const app = initializeApp({
  projectId,
  storageBucket: projectId + ".appspot.com",
});
const db = getFirestore();
const prefix = "revision-test-" + Date.now();
const owner = prefix + "-owner",
  reviewer = prefix + "-reviewer",
  stranger = prefix + "-stranger",
  paperId = prefix + "-paper";
const path1 = `papers/${owner}/${paperId}/v1.pdf`,
  path2 = `papers/${owner}/${paperId}/v2.pdf`;
const { handleApi } = require("../lib/api.js");
const call = (uid, action, input = {}) =>
  handleApi(action, input, uid, {
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
  });
let paper, request, note;
before(async () => {
  await getAuth().createUser({
    uid: owner,
    email: owner + "@example.test",
    password: "TestPass123!",
    emailVerified: true,
  });
  for (const uid of [owner, reviewer, stranger]) {
    await db.doc("profiles/" + uid).set({
      id: uid,
      name: uid,
      role: uid === reviewer ? "endorser" : "researcher",
      categories: ["cs.AI"],
      publicProfile: true,
      acceptingRequests: uid === reviewer,
      eligibilitySelfAttested: uid === reviewer,
      weeklyCapacity: 3,
    });
    await db.doc("users/" + uid).set({ email: uid + "@example.test" });
  }
  for (const [path, body] of [
    [path1, "Original PDF"],
    [path2, "Revised PDF"],
  ])
    await getStorage()
      .bucket()
      .file(path)
      .save(Buffer.from("%PDF-1.4\n" + body + "\n%%EOF"), {
        contentType: "application/pdf",
      });
});
after(async () => {
  for (const [collection, field, value] of [
    ["requests", "paperId", paperId],
    ["annotations", "paperId", paperId],
    ...["notifications", "emailOutbox"].flatMap((c) =>
      [owner, reviewer, stranger].map((uid) => [c, "userId", uid]),
    ),
  ]) {
    const docs = await db
      .collection(collection)
      .where(field, "==", value)
      .get();
    for (const doc of docs.docs) await doc.ref.delete();
  }
  await db
    .doc(
      "requestLocks/" +
        createHash("sha256").update(`${paperId}:${reviewer}`).digest("hex"),
    )
    .delete();
  await db.doc("papers/" + paperId).delete();
  await db.doc("reviewerQuotas/" + reviewer).delete();
  for (const uid of [owner, reviewer, stranger]) {
    await db.doc("profiles/" + uid).delete();
    await db.doc("users/" + uid).delete();
  }
  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `papers/${owner}/`, force: true });
  await getAuth().deleteUser(owner);
  await deleteApp(app);
});
test("initial paper and old annotations normalize to revision one", async () => {
  paper = await call(owner, "paper.save", {
    paper: {
      id: paperId,
      title: "Original manuscript",
      abstract: "Original abstract",
      category: "cs.AI",
      authors: "Author",
      text: "Version one text",
      storagePath: path1,
      fileName: "v1.pdf",
      visibility: "private",
    },
  });
  assert.equal(paper.version, 1);
  assert.equal(paper.versions.length, 1);
  request = await call(owner, "request.create", {
    paperId,
    reviewerId: reviewer,
    message: "Review this manuscript.",
  });
  assert.equal(request.paperVersion, 1);
  note = await call(reviewer, "annotation.save", {
    paperId,
    paperVersion: 1,
    page: 1,
    body: "Note on version one",
    visibility: "shared",
  });
  assert.equal(note.paperVersion, 1);
  await db.doc("annotations/" + prefix + "-legacy").set({
    paperId,
    authorId: owner,
    page: 1,
    body: "Legacy note",
    visibility: "private",
    createdAt: Date.now(),
  });
  assert.equal(
    (await call(owner, "annotation.list", { paperId })).find(
      (n) => n.id === prefix + "-legacy",
    ).paperVersion,
    1,
  );
});
test("content changes create a revision and notify the active reviewer; metadata changes do not", async () => {
  const before = (await call(reviewer, "notifications.list")).length;
  paper = await call(owner, "paper.save", {
    paper: {
      ...paper,
      expectedVersion: 1,
      title: "Revised manuscript",
      storagePath: path2,
      fileName: "v2.pdf",
      text: "Version two text",
    },
  });
  assert.equal(paper.version, 2);
  assert.deepEqual(
    paper.versions.map((v) => v.version),
    [1, 2],
  );
  assert.equal(paper.versions[0].storagePath, path1);
  const updated = await call(owner, "request.get", { id: request.id });
  assert.equal(updated.title, "Original manuscript");
  assert.equal(updated.currentPaperTitle, "Revised manuscript");
  assert.equal(updated.paperVersion, 2);
  assert.equal(updated.revisionAvailable, true);
  assert.equal((await call(reviewer, "notifications.list")).length, before + 1);
  paper = await call(owner, "paper.save", {
    paper: {
      ...paper,
      expectedVersion: 2,
      title: "Revised manuscript, corrected title",
    },
  });
  assert.equal(paper.version, 2);
  assert.equal(paper.versions.length, 2);
  assert.equal((await call(reviewer, "notifications.list")).length, before + 1);
});
test("stale note/save versions and changing an active request category are rejected", async () => {
  await assert.rejects(
    call(owner, "paper.save", {
      paper: { ...paper, expectedVersion: 1, text: "Stale overwrite" },
    }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    call(owner, "paper.save", {
      paper: { ...paper, expectedVersion: 2, category: "cs.LG" },
    }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    call(reviewer, "annotation.save", {
      paperId,
      paperVersion: 1,
      page: 1,
      body: "Stale highlight",
    }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    call(reviewer, "annotation.save", {
      id: note.id,
      paperId,
      paperVersion: 2,
      page: 1,
      body: "Move old note to new revision",
    }),
    (e) => e.code === "failed-precondition",
  );
  const current = await call(reviewer, "annotation.save", {
    paperId,
    paperVersion: 2,
    page: 1,
    body: "Current note",
    visibility: "shared",
  });
  assert.equal(current.paperVersion, 2);
  assert.deepEqual(
    new Set(
      (await call(owner, "annotation.list", { paperId })).map(
        (n) => n.paperVersion,
      ),
    ),
    new Set([1, 2]),
  );
});
test("archived PDFs require owner/active reviewer, and retain their actual file", async () => {
  const old = await call(reviewer, "paper.version.get", {
    id: paperId,
    version: 1,
  });
  assert.equal(old.version, 1);
  assert.equal(old.currentVersion, 2);
  assert.equal(old.title, "Original manuscript");
  assert.equal(old.text, "");
  assert.equal(old.storagePath, path1);
  assert.match(await (await fetch(old.downloadUrl)).text(), /Original PDF/);
  await assert.rejects(
    call(stranger, "paper.version.get", { id: paperId, version: 1 }),
    (e) => e.code === "permission-denied",
  );
});
test("concurrent replacements with the same expected revision cannot overwrite one another", async () => {
  const outcomes = await Promise.allSettled(
    ["A", "B"].map((v) =>
      call(owner, "paper.save", {
        paper: {
          ...paper,
          expectedVersion: 2,
          text: "Concurrent version " + v,
        },
      }),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.filter((r) => r.status === "rejected")[0].reason.code,
    "failed-precondition",
  );
  paper = outcomes.find((r) => r.status === "fulfilled").value;
  assert.equal(paper.version, 3);
});
test("withdrawal revokes archived access even for public papers, and unlocks category changes", async () => {
  await call(owner, "request.status", { id: request.id, status: "withdrawn" });
  paper = await call(owner, "paper.save", {
    paper: {
      ...paper,
      expectedVersion: 3,
      category: "cs.LG",
      visibility: "public",
    },
  });
  assert.equal(paper.version, 3);
  assert.equal(paper.category, "cs.LG");
  assert.equal((await call(stranger, "paper.get", { id: paperId })).version, 3);
  await assert.rejects(
    call(reviewer, "paper.version.get", { id: paperId, version: 1 }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(stranger, "paper.version.get", { id: paperId, version: 2 }),
    (e) => e.code === "permission-denied",
  );
});
test("revision history is capped at the latest twenty metadata entries", async () => {
  for (let i = 0; i < 21; i++)
    paper = await call(owner, "paper.save", {
      paper: {
        ...paper,
        expectedVersion: paper.version,
        text: "Revision history fixture " + i,
      },
    });
  assert.equal(paper.version, 24);
  assert.equal(paper.versions.length, 20);
  assert.equal(paper.versions[0].version, 5);
  assert.equal(paper.versions.at(-1).version, 24);
  assert.ok(paper.versions.every((v) => !("text" in v)));
  await assert.rejects(
    call(owner, "paper.version.get", { id: paperId, version: 1 }),
    (e) => e.code === "not-found",
  );
});
test("Storage rules prevent a client from overwriting or deleting a previous revision object", async () => {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
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
  const { idToken } = await response.json();
  assert.ok(idToken);
  const upload = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${projectId}.appspot.com/o?uploadType=media&name=${encodeURIComponent(path1)}`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + idToken,
        "content-type": "application/pdf",
      },
      body: Buffer.from("%PDF-1.4\nOverwrite"),
    },
  );
  assert.equal(upload.status, 403);
  const deletion = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(path1)}`,
    { method: "DELETE", headers: { Authorization: "Bearer " + idToken } },
  );
  assert.equal(deletion.status, 403);
  assert.equal((await getStorage().bucket().file(path1).exists())[0], true);
});
