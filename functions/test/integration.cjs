// Run against Auth + Firestore + Storage emulators, never a production project.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !(
    process.env.STORAGE_EMULATOR_HOST ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
  )
)
  throw new Error("Integration tests require all three Firebase emulators.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const projectId = "demo-paperbridge";
const app = initializeApp({
  projectId,
  storageBucket: projectId + ".appspot.com",
});
const db = getFirestore();
const auth = getAuth();
const { handleApi, deleteAccount } = require("../lib/api.js");
const { withAccountLease } = require("../lib/lifecycle.js");
const token = {
  email_verified: true,
  auth_time: Math.floor(Date.now() / 1000),
};
const call = (uid, action, input = {}) => handleApi(action, input, uid, token);
const ids = ["author", "reviewer", "outsider", "reviewer2", "author2"].map(
  (v) => "it-" + v,
);
const [author, reviewer, outsider, reviewer2, author2] = ids;
const base = (name, role = "researcher") => ({
  name,
  role,
  categories: ["cs.AI"],
  headline: "Researcher",
  institution: "",
  bio: "",
  weeklyCapacity: 2,
  acceptingRequests: role === "endorser",
  eligibilitySelfAttested: role === "endorser",
  publicProfile: true,
});
let paper, request;
before(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  for (const uid of ids) {
    try {
      await auth.deleteUser(uid);
    } catch {}
    await auth.createUser({
      uid,
      email: uid + "@example.test",
      password: "TestPass123!",
      emailVerified: true,
    });
    await call(uid, "profile.save", {
      profile: base(uid, uid.includes("reviewer") ? "endorser" : "researcher"),
    });
  }
});
after(async () => deleteApp(app));
test("onboarding keeps email private and requires authentication", async () => {
  const p = await call(author, "profile.get", { id: reviewer });
  assert.equal(p.email, undefined);
  await assert.rejects(
    handleApi("profile.get", {}, "", token),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    handleApi("feed.post", { body: "Hi" }, author, { email_verified: false }),
    (e) => e.code === "failed-precondition",
  );
});
test("private paper cannot be fetched by outsiders; review is atomic and queues both emails", async () => {
  paper = await call(author, "paper.save", {
    paper: {
      id: "it-paper",
      title: "Test Paper",
      abstract: "An abstract.",
      category: "cs.AI",
      authors: "Author",
      text: "An unpublished private manuscript.",
      visibility: "private",
    },
  });
  await assert.rejects(
    call(outsider, "paper.get", { id: paper.id }),
    (e) => e.code === "permission-denied",
  );
  request = await call(author, "request.create", {
    paperId: paper.id,
    reviewerId: reviewer,
    message: "Please review.",
    endorsementUrl: "https://arxiv.org/auth/endorse?token=private",
  });
  assert.equal(request.status, "pending");
  assert.equal(
    (await call(reviewer, "paper.get", { id: paper.id })).text,
    paper.text,
  );
  assert.equal((await db.collection("emailOutbox").get()).size, 2);
  const notices = await call(author, "notifications.list");
  // With the Functions emulator running, the real worker may already hold its delivery lease.
  assert.ok(["queued", "processing"].includes(notices[0].emailStatus));
  assert.equal(notices[0].to, undefined);
  await assert.rejects(
    call(outsider, "request.get", { id: request.id }),
    (e) => e.code === "permission-denied",
  );
  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      call(author, "request.create", {
        paperId: paper.id,
        reviewerId: reviewer,
        message: "Duplicate",
      }),
    ),
  );
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 0);
  assert.equal((await db.collection("requests").get()).size, 1);
});
test("annotations preserve private notes and share only deliberate notes", async () => {
  await call(reviewer, "annotation.save", {
    paperId: paper.id,
    page: 1,
    body: "Reviewer private",
    visibility: "private",
    color: "yellow",
  });
  await call(reviewer, "annotation.save", {
    paperId: paper.id,
    page: 1,
    quote: "unpublished",
    body: "Shared comment",
    visibility: "shared",
    color: "green",
  });
  const mine = await call(reviewer, "annotation.list", { paperId: paper.id });
  const theirs = await call(author, "annotation.list", { paperId: paper.id });
  assert.equal(mine.length, 2);
  assert.equal(theirs.length, 1);
  assert.equal(theirs[0].body, "Shared comment");
  await assert.rejects(
    call(author, "annotation.delete", {
      id: mine.find((x) => x.visibility === "private").id,
    }),
    (e) => e.code === "permission-denied",
  );
});
test("status transitions enforce roles; withdrawal immediately revokes private access", async () => {
  await assert.rejects(
    call(author, "request.status", { id: request.id, status: "accepted" }),
  );
  await call(reviewer, "request.status", {
    id: request.id,
    status: "reviewing",
    note: "Review started.",
  });
  await call(author, "request.comment", { id: request.id, body: "Thank you." });
  assert.equal(
    (await call(reviewer, "request.messages", { id: request.id })).length,
    2,
  );
  await call(author, "request.status", { id: request.id, status: "withdrawn" });
  await assert.rejects(
    call(reviewer, "paper.get", { id: paper.id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(reviewer, "annotation.list", { paperId: paper.id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(reviewer, "request.status", { id: request.id, status: "accepted" }),
  );
});
test("capacity transaction permits exactly one of concurrent competing requests", async () => {
  await call(reviewer2, "profile.save", {
    profile: { ...base("Reviewer 2", "endorser"), weeklyCapacity: 1 },
  });
  const p2 = await call(author2, "paper.save", {
    paper: {
      id: "it-paper2",
      title: "Another paper",
      abstract: "Abstract",
      category: "cs.AI",
      authors: "Second author",
    },
  });
  const result = await Promise.allSettled([
    call(author, "request.create", {
      paperId: paper.id,
      reviewerId: reviewer2,
      message: "First",
    }),
    call(author2, "request.create", {
      paperId: p2.id,
      reviewerId: reviewer2,
      message: "Second",
    }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    result.filter((r) => r.status === "rejected")[0].reason.code,
    "resource-exhausted",
  );
  const won = result.find((r) => r.status === "fulfilled").value;
  await call(reviewer2, "request.status", { id: won.id, status: "accepted" });
  await assert.rejects(
    call(reviewer2, "request.status", { id: won.id, status: "endorsed" }),
  );
  await call(won.requesterId, "request.status", {
    id: won.id,
    status: "endorsed",
  });
  const board = await call(author, "leaderboard.list", { period: "week" });
  assert.equal(board[0].endorsements, 1);
  assert.equal(board[0].completionSource, "author_reported");
});
test("feed visibility, likes, comments and social blocking", async () => {
  await assert.rejects(
    call(author, "feed.post", { body: "Private attach", paperId: paper.id }),
    (e) => e.code === "failed-precondition",
  );
  const post = await call(author, "feed.post", {
    body: "Research update",
    arxivUrl: "https://arxiv.org/abs/2601.12345",
  });
  assert.equal(
    (await call(outsider, "feed.like", { id: post.id })).likeCount,
    1,
  );
  assert.equal(
    (await call(outsider, "feed.like", { id: post.id })).likeCount,
    0,
  );
  await call(outsider, "feed.comment", { id: post.id, body: "Nice work." });
  assert.equal(
    (await call(author, "feed.comments", { id: post.id })).length,
    1,
  );
  await call(outsider, "follow.toggle", { id: author });
  assert.equal((await call(author, "follow.list")).followers.length, 1);
  const chat = await call(outsider, "chat.open", { userId: author });
  await call(outsider, "chat.send", { id: chat.id, body: "Hello" });
  assert.equal(
    (await call(author, "chat.messages", { id: chat.id })).length,
    1,
  );
  await assert.rejects(
    call(reviewer, "chat.messages", { id: chat.id }),
    (e) => e.code === "permission-denied",
  );
  await call(author, "block.toggle", { userId: outsider });
  assert.equal((await call(author, "follow.list")).followers.length, 0);
  await assert.rejects(
    call(outsider, "chat.send", { id: chat.id, body: "Blocked" }),
    (e) => e.code === "permission-denied",
  );
  assert.equal((await call(outsider, "feed.list")).length, 0);
  await call(author, "block.toggle", { userId: outsider });
});
test("exports never include provider credential material; reauthentication required for deletion", async () => {
  await db
    .collection("aiKeys")
    .doc(author + "_openai")
    .set({ ownerId: author, encrypted: "never-export-this" });
  const exported = await call(author, "account.export");
  assert.equal(JSON.stringify(exported).includes("never-export-this"), false);
  assert.ok(exported.papers.length);
  await assert.rejects(
    handleApi("account.delete", {}, author, {
      email_verified: true,
      auth_time: 1,
    }),
    (e) => e.code === "failed-precondition",
  );
});
test("direct Firestore access is denied even to a signed-in owner", async () => {
  const signIn = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: author + "@example.test",
        password: "TestPass123!",
        returnSecureToken: true,
      }),
    },
  );
  const authResult = await signIn.json();
  assert.ok(authResult.idToken);
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/papers/${paper.id}`,
    { headers: { Authorization: "Bearer " + authResult.idToken } },
  );
  assert.equal(response.status, 403);
});
test("public visibility does not expose private collaboration annotations", async () => {
  await call(author, "paper.save", {
    paper: { ...paper, visibility: "public" },
  });
  assert.equal(
    (await call(outsider, "paper.get", { id: paper.id })).title,
    paper.title,
  );
  await assert.rejects(
    call(outsider, "annotation.list", { paperId: paper.id }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    call(outsider, "annotation.save", {
      paperId: paper.id,
      page: 1,
      body: "Intrusion",
      visibility: "shared",
    }),
    (e) => e.code === "permission-denied",
  );
  await call(author, "paper.save", {
    paper: { ...paper, visibility: "private" },
  });
});
test("bounded histories retain the newest records instead of arbitrary document IDs", async () => {
  const chat = await call(outsider, "chat.open", { userId: author });
  const now = Date.now() + 1000;
  for (let offset = 0; offset < 520; offset += 250) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(520, offset + 250); i++)
      batch.set(
        db
          .collection("chatMessages")
          .doc(`history-${String(i).padStart(3, "0")}`),
        {
          chatId: chat.id,
          authorId: outsider,
          body: "message-" + i,
          createdAt: now + i,
        },
      );
    await batch.commit();
  }
  const messages = await call(author, "chat.messages", { id: chat.id });
  assert.equal(messages.length, 500);
  assert.equal(messages[0].body, "message-20");
  assert.equal(messages[499].body, "message-519");
  for (const [collection, field] of [
    ["papers", "ownerId"],
    ["requests", "requesterId"],
    ["notifications", "userId"],
  ]) {
    const batch = db.batch();
    for (let i = 0; i < 220; i++)
      batch.set(
        db.collection(collection).doc(`history-${String(i).padStart(3, "0")}`),
        { [field]: outsider, createdAt: now + i, status: "withdrawn" },
      );
    await batch.commit();
    const list = await call(
      outsider,
      collection === "papers"
        ? "paper.list"
        : collection === "requests"
          ? "request.list"
          : "notifications.list",
    );
    assert.equal(
      list[0].id,
      "history-219",
      collection + " should return newest first",
    );
  }
});
test("deletion waits for in-flight operations, denies old tokens, and prevents data resurrection", async () => {
  const uid = "it-race";
  try {
    await auth.deleteUser(uid);
  } catch {}
  await auth.createUser({
    uid,
    email: "race@example.test",
    emailVerified: true,
  });
  await call(uid, "profile.save", { profile: base("Race tester") });
  let release, entered;
  const started = new Promise((r) => (entered = r));
  const hold = new Promise((r) => (release = r));
  const active = withAccountLease(uid, async () => {
    entered();
    await hold;
    await db
      .collection("aiKeys")
      .doc(uid + "_openai")
      .set({ ownerId: uid, encrypted: "in-flight-secret" });
  });
  await started;
  const pending = await call(uid, "account.delete");
  assert.equal(pending.pending, true);
  assert.equal((await auth.getUser(uid)).disabled, true);
  await assert.rejects(
    call(uid, "profile.save", { profile: base("Resurrect") }),
    (e) => e.code === "failed-precondition",
  );
  release();
  await active;
  assert.equal(await deleteAccount(uid), true);
  assert.equal(
    (
      await db
        .collection("aiKeys")
        .doc(uid + "_openai")
        .get()
    ).exists,
    false,
  );
  assert.equal((await db.collection("profiles").doc(uid).get()).exists, false);
  await assert.rejects(
    call(uid, "paper.save", {
      paper: { title: "Resurrect", abstract: "No", category: "cs.AI" },
    }),
    (e) => e.code === "failed-precondition",
  );
});
test("Storage rules deny every direct client upload; authorized viewer URL works", async () => {
  const signIn = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: author + "@example.test",
        password: "TestPass123!",
        returnSecureToken: true,
      }),
    },
  );
  const { idToken } = await signIn.json();
  const host =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
    process.env.STORAGE_EMULATOR_HOST.replace(/^https?:\/\//, "");
  const base = `http://${host}/v0/b/${projectId}.appspot.com/o`;
  const upload = (path, type) =>
    fetch(`${base}?uploadType=media&name=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + idToken, "content-type": type },
      body: Buffer.from("%PDF-1.4\nTest paper\n%%EOF"),
    });
  assert.equal(
    (await upload(`papers/${outsider}/secret/test.pdf`, "application/pdf"))
      .status,
    403,
  );
  assert.equal(
    (await upload(`papers/${author}/${paper.id}/bad.pdf`, "text/html")).status,
    403,
  );
  const path = `papers/${author}/${paper.id}/manuscript.pdf`;
  const response = await upload(path, "application/pdf");
  assert.equal(response.status, 403, await response.text());
  const { savePrivatePdf } = require("../lib/uploads.js");
  await savePrivatePdf(
    getStorage().bucket().file(path),
    Buffer.from("%PDF-1.4\nTest paper\n%%EOF"),
  );
  const deletion = await fetch(`${base}/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + idToken },
  });
  assert.equal(deletion.status, 403);
  await call(author, "paper.save", {
    paper: { ...paper, storagePath: path, fileName: "manuscript.pdf" },
  });
  const anonymous = await fetch(
    `${base}/${encodeURIComponent(path)}?alt=media`,
  );
  assert.equal(anonymous.status, 403);
  const p = await call(author, "paper.get", { id: paper.id });
  const pdf = await fetch(p.downloadUrl);
  assert.equal(pdf.status, 200);
  assert.match(await pdf.text(), /%PDF/);
});
test("account erasure removes AI keys and manuscripts and anonymizes historical requests", async () => {
  await call(author, "account.delete");
  assert.equal(
    (
      await db
        .collection("aiKeys")
        .doc(author + "_openai")
        .get()
    ).exists,
    false,
  );
  assert.equal(
    (await db.collection("papers").doc(paper.id).get()).exists,
    false,
  );
  assert.equal(
    (await db.collection("profiles").doc(author).get()).exists,
    false,
  );
  await assert.rejects(
    auth.getUser(author),
    (e) => e.code === "auth/user-not-found",
  );
  assert.equal(
    (await db.collection("requests").doc(request.id).get()).data()
      .requesterName,
    "Deleted account",
  );
});
