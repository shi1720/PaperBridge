const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Collaboration tests require Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
process.env.PAPERBRIDGE_DATABASE_ID =
  "collaboration-" + Date.now().toString(36);
const app = initializeApp({ projectId: "demo-paperbridge" });
const { getDb } = require("../lib/runtime.js"),
  { handleApi } = require("../lib/api.js");
const db = getDb(),
  owner = "author",
  a = "reviewer-a",
  b = "reviewer-b",
  paperId = "collaboration-paper",
  ra = "request-a",
  rb = "request-b";
const call = (uid, action, input = {}) =>
  handleApi(action, input, uid, { email_verified: true });
const noteInput = {
  paperId,
  page: 1,
  body: "Review this argument",
  quote: "A bounded claim",
  paperVersion: 1,
  color: "yellow",
  visibility: "shared",
};
let scoped, privateNote, legacy;
before(async () => {
  for (const uid of [owner, a, b])
    await db.doc("profiles/" + uid).set({
      id: uid,
      name: "Name " + uid,
      role: "researcher",
      publicProfile: true,
    });
  await db.doc("papers/" + paperId).set({
    id: paperId,
    ownerId: owner,
    title: "Collaboration paper",
    version: 1,
    visibility: "private",
  });
  for (const [id, reviewerId] of [
    [ra, a],
    [rb, b],
  ])
    await db
      .doc("requests/" + id)
      .set({ id, paperId, requesterId: owner, reviewerId, status: "accepted" });
});
after(async () => {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  await deleteApp(app);
});
test("request notes stay inside their participant pair even with multiple active reviewers on one manuscript", async () => {
  scoped = await call(a, "annotation.save", { ...noteInput, requestId: ra });
  assert.equal(scoped.authorName, "Name " + a);
  assert.equal(scoped.requestId, ra);
  privateNote = await call(a, "annotation.save", {
    ...noteInput,
    requestId: ra,
    visibility: "private",
  });
  legacy = await call(owner, "annotation.save", noteInput);
  const mine = await call(owner, "annotation.list", { paperId, requestId: ra });
  assert.ok(mine.some((n) => n.id === scoped.id));
  assert.equal(
    mine.some((n) => n.id === privateNote.id),
    false,
  );
  for (const input of [{ paperId }, { paperId, requestId: rb }])
    assert.equal(
      (await call(b, "annotation.list", input)).some(
        (n) => n.id === scoped.id || n.id === privateNote.id,
      ),
      false,
    );
  assert.ok(
    (await call(b, "annotation.list", { paperId })).some(
      (n) => n.id === legacy.id,
    ),
  );
  await assert.rejects(
    call(b, "annotation.list", { paperId, requestId: ra }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(b, "annotation.save", { ...noteInput, requestId: ra }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(a, "annotation.save", { ...scoped, requestId: rb }),
    (e) => e.code === "failed-precondition",
  );
});
test("shared note participants can reply and resolve; private notes stay author-only and edits preserve thread state", async () => {
  await assert.rejects(
    call(b, "annotation.reply", { id: scoped.id, body: "Intrusion" }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(owner, "annotation.reply", {
      id: privateNote.id,
      body: "Private intrusion",
    }),
    (e) => e.code === "permission-denied",
  );
  const replied = await call(owner, "annotation.reply", {
    id: scoped.id,
    body: "I revised the argument.",
  });
  assert.equal(replied.replies.length, 1);
  assert.equal(replied.replies[0].authorId, owner);
  assert.ok(replied.replies[0].id);
  const resolved = await call(a, "annotation.resolve", {
    id: scoped.id,
    resolved: true,
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.resolvedBy, a);
  assert.equal(resolved.resolvedByName, "Name " + a);
  const edited = await call(a, "annotation.save", {
    ...scoped,
    body: "Updated note body",
    replies: [],
    resolved: false,
  });
  assert.equal(edited.replies.length, 1);
  assert.equal(edited.resolved, true);
  assert.equal(edited.requestId, ra);
  const reopened = await call(owner, "annotation.resolve", {
    id: scoped.id,
    resolved: false,
  });
  assert.equal(reopened.resolvedBy, null);
  assert.equal(reopened.resolvedAt, null);
  const exported = await call(owner, "account.export");
  assert.equal(
    exported.annotationReplies[0].replies[0].body,
    "I revised the argument.",
  );
  await db.doc("annotations/" + scoped.id).update({
    replies: Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      authorId: owner,
      body: "Existing reply",
    })),
  });
  await assert.rejects(
    call(a, "annotation.reply", { id: scoped.id, body: "Overflow" }),
    (e) => e.code === "resource-exhausted",
  );
});
test("closed requests, blocks and archived PDF revisions prohibit collaboration mutations", async () => {
  await db.doc("requests/" + ra).update({ status: "withdrawn" });
  for (const [action, input] of [
    ["annotation.reply", { id: scoped.id, body: "Closed" }],
    ["annotation.resolve", { id: scoped.id, resolved: true }],
    ["annotation.save", { ...scoped, body: "Closed edit" }],
  ])
    await assert.rejects(
      call(owner === scoped.authorId ? owner : a, action, input),
      (e) => ["permission-denied", "failed-precondition"].includes(e.code),
    );
  await assert.rejects(
    call(a, "annotation.list", { paperId, requestId: ra }),
    (e) => e.code === "permission-denied",
  );
  await db.doc("requests/" + ra).update({ status: "accepted" });
  await call(a, "block.toggle", { userId: owner });
  await assert.rejects(
    call(a, "annotation.reply", { id: scoped.id, body: "Blocked" }),
    (e) => e.code === "permission-denied",
  );
  await call(a, "block.toggle", { userId: owner });
  await db.doc("papers/" + paperId).update({ version: 2 });
  for (const action of ["annotation.reply", "annotation.resolve"])
    await assert.rejects(
      call(owner, action, {
        id: scoped.id,
        body: "Old revision",
        resolved: true,
      }),
      (e) => e.code === "failed-precondition",
    );
  assert.ok(
    (await call(owner, "annotation.list", { paperId, requestId: ra })).some(
      (n) => n.id === scoped.id,
    ),
  );
  await assert.rejects(
    call(owner, "annotation.delete", { id: scoped.id }),
    (e) => e.code === "permission-denied",
  );
  await call(a, "annotation.delete", { id: scoped.id });
  assert.equal((await db.doc("annotations/" + scoped.id).get()).exists, false);
});

test("completed requests are read-only and collaboration note mutations require verified email", async () => {
  await db.doc("requests/" + ra).update({ status: "endorsed" });
  await assert.rejects(
    call(owner, "request.comment", { id: ra, body: "After completion" }),
    (e) => e.code === "failed-precondition",
  );
  for (const action of ["annotation.reply", "annotation.resolve"])
    await assert.rejects(
      handleApi(
        action,
        { id: privateNote.id, body: "Unverified reply", resolved: true },
        a,
        { email_verified: false },
      ),
      (e) => e.code === "failed-precondition",
    );
});

test("unverified accounts can keep private drafts but cannot publish or edit shared notes by omitting visibility", async () => {
  const saveUnverified = (input) =>
    handleApi("annotation.save", input, owner, { email_verified: false });
  const input = { ...noteInput, paperVersion: 2, visibility: "private" };
  const privateDraft = await saveUnverified(input);
  assert.equal(privateDraft.visibility, "private");
  assert.equal(
    (
      await saveUnverified({
        ...privateDraft,
        body: "An updated private draft",
      })
    ).body,
    "An updated private draft",
  );
  const verificationRequired = (e) =>
    e.code === "failed-precondition" && /Verify your email/.test(e.message);
  await assert.rejects(
    saveUnverified({ ...input, visibility: "shared" }),
    verificationRequired,
  );
  await assert.rejects(
    saveUnverified({ ...privateDraft, visibility: "shared" }),
    verificationRequired,
  );
  const shared = await call(owner, "annotation.save", {
    ...input,
    visibility: "shared",
  });
  const { visibility, ...withoutVisibility } = shared;
  await assert.rejects(
    saveUnverified({ ...withoutVisibility, body: "Omitted visibility bypass" }),
    verificationRequired,
  );
  await assert.rejects(
    saveUnverified({ ...shared, body: "Shared edit" }),
    verificationRequired,
  );
  assert.equal(
    (await db.doc("annotations/" + shared.id).get()).data().body,
    shared.body,
  );
  assert.equal(
    (await db.doc("annotations/" + privateDraft.id).get()).data().visibility,
    "private",
  );
  assert.equal(
    (await call(owner, "annotation.save", { ...shared, body: "Verified edit" }))
      .body,
    "Verified edit",
  );
});

test("request comments cannot commit after concurrent closing, membership, block or recipient deletion changes", async () => {
  const { createHash } = require("node:crypto");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const requestRef = db.doc("requests/" + ra),
    outgoing = db.doc("blocks/" + hash(`${a}:${owner}`)),
    incoming = db.doc("blocks/" + hash(`${owner}:${a}`)),
    deletion = db.doc("deletionJobs/" + owner);
  const prototype = Object.getPrototypeOf(requestRef),
    originalGet = prototype.get,
    originalGetAll = db.getAll;
  const reset = async () => {
    await Promise.all([
      outgoing.delete(),
      incoming.delete(),
      deletion.delete(),
    ]);
    await requestRef.set({
      id: ra,
      paperId,
      title: "Race fixture",
      requesterId: owner,
      reviewerId: a,
      status: "accepted",
    });
  };
  for (const change of [
    "withdrawn",
    "declined",
    "endorsed",
    "membership",
    "outgoing-block",
    "incoming-block",
    "recipient-deleted",
  ]) {
    await reset();
    const beforeMessages = (
      await db.collection("requestMessages").where("requestId", "==", ra).get()
    ).size;
    const beforeNotifications = (await db.collection("notifications").get())
      .size;
    let injected = false;
    const mutate = async () => {
      injected = true;
      if (["withdrawn", "declined", "endorsed"].includes(change))
        await requestRef.update({ status: change });
      else if (change === "membership")
        await requestRef.update({ reviewerId: b });
      else if (change === "recipient-deleted")
        await deletion.set({ status: "pending" });
      else
        await (change === "outgoing-block" ? outgoing : incoming).set({
          ownerId: change === "outgoing-block" ? a : owner,
          targetId: change === "outgoing-block" ? owner : a,
        });
    };
    prototype.get = async function (...args) {
      const snapshot = await originalGet.apply(this, args);
      if (
        !injected &&
        this.path === requestRef.path &&
        !change.endsWith("block")
      )
        await mutate();
      return snapshot;
    };
    db.getAll = async function (...refs) {
      const snapshots = await originalGetAll.apply(this, refs);
      if (
        !injected &&
        change.endsWith("block") &&
        refs.some((ref) => ref.path === outgoing.path)
      )
        await mutate();
      return snapshots;
    };
    try {
      await assert.rejects(
        call(a, "request.comment", {
          id: ra,
          body: "A racing request comment",
        }),
        (e) => ["failed-precondition", "permission-denied"].includes(e.code),
      );
      assert.equal(
        injected,
        true,
        "fixture must change state after the initial authorized snapshot",
      );
    } finally {
      prototype.get = originalGet;
      db.getAll = originalGetAll;
    }
    assert.equal(
      (
        await db
          .collection("requestMessages")
          .where("requestId", "==", ra)
          .get()
      ).size,
      beforeMessages,
    );
    assert.equal(
      (await db.collection("notifications").get()).size,
      beforeNotifications,
    );
  }
  await reset();
  const message = await call(a, "request.comment", {
    id: ra,
    body: "An active collaboration still works",
  });
  assert.equal(message.body, "An active collaboration still works");
  assert.equal(
    (await db.doc("requestMessages/" + message.id).get()).exists,
    true,
  );
  assert.ok(
    (await db.collection("notifications").where("userId", "==", owner).get())
      .size > 0,
  );
});
