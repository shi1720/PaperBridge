// Nondestructive: each test owns uniquely namespaced fixtures; no emulator reset or live provider calls.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("DTO tests require Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-paperbridge" });
const db = getFirestore();
const { handleApi } = require("../lib/api.js");
const { handleAI } = require("../lib/ai.js");
const prefix = "dto-test-" + Date.now(),
  owner = prefix + "-owner",
  other = prefix + "-other",
  paperId = prefix + "-paper",
  jobId = prefix + "-job";
const manuscript = "PRIVATE-MANUSCRIPT-BODY ".repeat(15000),
  details = "PRIVATE-AUDIT-FINDING";
const call = (action, input = {}) =>
  handleApi(action, input, owner, { email_verified: true });
before(async () => {
  await db.doc("papers/" + paperId).set({
    ownerId: owner,
    title: "Fixture paper",
    abstract: "Public-facing abstract",
    category: "cs.AI",
    authors: "Fixture author",
    visibility: "private",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    text: manuscript,
    versions: [
      {
        version: 1,
        storagePath: "private-historical-path",
        title: "Old title",
      },
    ],
  });
  await db.doc("papers/" + prefix + "-other-paper").set({
    ownerId: other,
    title: "Other user manuscript",
    text: "OTHER-PRIVATE-MANUSCRIPT",
    createdAt: Date.now(),
  });
  await db.doc("aiJobs/" + jobId).set({
    ownerId: owner,
    paperId,
    title: "Fixture audit",
    status: "completed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    results: {
      evidence: { summary: details, findings: [{ quote: "Private quote" }] },
    },
    consent: { providers: ["openai"] },
    agents: { evidence: { model: "private-model" } },
    scope: { private: "private-scope" },
    errors: [{ message: "private-error" }],
    inputHash: "private-input-hash",
  });
  await db.doc("aiJobs/" + prefix + "-other-job").set({
    ownerId: other,
    paperId,
    title: "Other private audit",
    status: "completed",
    createdAt: Date.now(),
    results: { secret: "OTHER-PRIVATE-AUDIT" },
  });
});
after(async () => {
  for (const path of [
    "papers/" + paperId,
    "papers/" + prefix + "-other-paper",
    "aiJobs/" + jobId,
    "aiJobs/" + prefix + "-other-job",
  ])
    await db.doc(path).delete();
  await deleteApp(app);
});
test("paper library summary excludes extracted text/history and preserves legacy character count", async () => {
  const list = await call("paper.list");
  assert.equal(list.length, 1);
  const item = list[0];
  assert.equal(item.id, paperId);
  assert.equal(item.text, undefined);
  assert.equal(item.versions, undefined);
  assert.equal(item.textCharacterCount, manuscript.length);
  assert.equal(item.version, 1);
  const json = JSON.stringify(list);
  assert.equal(json.includes("PRIVATE-MANUSCRIPT-BODY"), false);
  assert.equal(json.includes("private-historical-path"), false);
  assert.ok(json.length < 2000);
  const full = await call("paper.get", { id: paperId });
  assert.equal(full.text, manuscript);
  assert.equal(full.versions.length, 1);
});
test("AI history is metadata-only while authorized detail keeps full findings", async () => {
  const list = await handleAI("ai.jobs", {}, owner);
  assert.equal(list.length, 1);
  assert.deepEqual(
    Object.keys(list[0]).sort(),
    [
      "id",
      "ownerId",
      "paperId",
      "title",
      "status",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  assert.equal(list[0].id, jobId);
  const json = JSON.stringify(list);
  for (const privateValue of [
    details,
    "Private quote",
    "private-model",
    "private-scope",
    "private-error",
    "private-input-hash",
    "OTHER-PRIVATE-AUDIT",
  ])
    assert.equal(json.includes(privateValue), false);
  assert.ok(json.length < 1500);
  const full = await handleAI("ai.job.get", { id: jobId }, owner);
  assert.equal(full.results.evidence.summary, details);
  await assert.rejects(
    handleAI("ai.job.get", { id: jobId }, other),
    (e) => e.code === "not-found",
  );
});
