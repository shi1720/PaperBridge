// Requires Firestore emulator. No live model calls or real credentials.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
process.env.AI_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Refusing integration tests without FIRESTORE_EMULATOR_HOST");
initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-paperbridge" });
const { handleAI } = require("../lib/ai");
const db = getFirestore(),
  uid = "ai-owner-test",
  other = "ai-other-test",
  paperId = "ai-paper-test";
const text =
  "We surveyed ten volunteers from one university. Our results prove that sleep causes better memory in all adults. No confidence intervals were computed and no randomization was used.";
const originalFetch = global.fetch;
let generations = 0;
before(async () => {
  global.fetch = async (url, options) => {
    if (String(url).endsWith("/models"))
      return new Response(JSON.stringify({ data: [{ id: "gpt-test" }] }));
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    generations++;
    const result = {
      summary: "Causal inference needs revision.",
      findings: [
        {
          title: "Causality",
          severity: "high",
          quote:
            "Our results prove that sleep causes better memory in all adults.",
          explanation: "Observational design cannot establish causation.",
          recommendation: "Use association language.",
          sourceIds: [],
        },
      ],
      limitations: ["Extracted text only."],
    };
    return new Response(
      JSON.stringify({
        status: "completed",
        model: "gpt-test",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(result) }] },
        ],
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
    );
  };
  await db
    .collection("papers")
    .doc(paperId)
    .set({ ownerId: uid, title: "Sleep pilot", text, updatedAt: 1 });
});
after(async () => {
  global.fetch = originalFetch;
  for (const collection of ["aiJobs", "aiKeys"]) {
    const rows = await db
      .collection(collection)
      .where("ownerId", "==", uid)
      .get();
    await Promise.all(rows.docs.map((d) => d.ref.delete()));
  }
  await Promise.all(
    ["aiSettings", "aiUsage"].map((c) => db.collection(c).doc(uid).delete()),
  );
  await db.collection("papers").doc(paperId).delete();
});
test("AI ownership, consent, secret isolation, four stages, idempotency and daily cap", async () => {
  await assert.rejects(
    handleAI("ai.settings", {}, ""),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    handleAI(
      "ai.review",
      {
        paperId,
        requestId: "no-consent",
        consent: false,
        allowMetadataLookup: false,
      },
      uid,
    ),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    handleAI(
      "ai.review",
      {
        paperId,
        requestId: "other",
        consent: true,
        allowMetadataLookup: false,
      },
      other,
    ),
    (e) => e.code === "permission-denied",
  );
  const saved = await handleAI(
    "ai.key.save",
    { provider: "openai", key: "test-api-key-at-least-20-chars" },
    uid,
  );
  assert.equal(saved.connected, true);
  assert.equal(JSON.stringify(saved).includes("test-api-key"), false);
  const encrypted = (
    await db
      .collection("aiKeys")
      .doc(uid + "_openai")
      .get()
  ).data();
  assert.ok(encrypted.encrypted.ciphertext);
  assert.equal(JSON.stringify(encrypted).includes("test-api-key"), false);
  const cfg = { provider: "openai", model: "gpt-test" };
  await handleAI(
    "ai.configure",
    { agents: { evidence: cfg, originality: cfg, reviewer: cfg } },
    uid,
  );
  const settings = await handleAI("ai.settings", {}, uid);
  assert.deepEqual(Object.keys(settings.keys[0]).sort(), [
    "provider",
    "updatedAt",
  ]);
  const payload = {
    paperId,
    requestId: "idempotent-run",
    consent: true,
    allowMetadataLookup: false,
  };
  const [one, two] = await Promise.all([
    handleAI("ai.review", payload, uid),
    handleAI("ai.review", payload, uid),
  ]);
  assert.equal(one.id, two.id);
  assert.equal(generations, 4);
  const job = await handleAI("ai.job.get", { id: one.id }, uid);
  assert.equal(job.status, "completed");
  assert.deepEqual(Object.keys(job.results).sort(), [
    "evidence",
    "originality",
    "reviewer",
    "synthesis",
  ]);
  assert.equal(job.consent.metadataLookup, false);
  assert.equal(job.scope.reviewedCharacters, text.length);
  await handleAI("ai.review", payload, uid);
  assert.equal(generations, 4);
  await assert.rejects(
    handleAI("ai.job.get", { id: one.id }, other),
    (e) => e.code === "not-found",
  );
  assert.equal((await handleAI("ai.jobs", {}, other)).length, 0);
  await db
    .collection("aiUsage")
    .doc(uid)
    .set({
      ownerId: uid,
      day: new Date().toISOString().slice(0, 10),
      count: 10,
      activeUntil: 0,
    });
  await assert.rejects(
    handleAI("ai.review", { ...payload, requestId: "daily-limit" }, uid),
    (e) => e.code === "resource-exhausted",
  );
  assert.equal(generations, 4);
  await handleAI("ai.key.delete", { provider: "openai" }, uid);
  assert.equal((await handleAI("ai.settings", {}, uid)).keys.length, 0);
});
test("provider failures retain partial audits and release concurrency lease", async () => {
  await db.collection("aiUsage").doc(uid).delete();
  await handleAI(
    "ai.key.save",
    { provider: "openai", key: "test-api-key-at-least-20-chars" },
    uid,
  );
  const normal = global.fetch;
  let attempts = 0;
  global.fetch = async (...args) => {
    if (String(args[0]).endsWith("/responses") && ++attempts === 2)
      return new Response("Do not expose provider body or secret", {
        status: 429,
      });
    return normal(...args);
  };
  try {
    const job = await handleAI(
      "ai.review",
      {
        paperId,
        requestId: "partial-run",
        consent: true,
        allowMetadataLookup: false,
      },
      uid,
    );
    assert.equal(job.status, "partial");
    assert.equal(job.errors[0].agent, "originality");
    assert.equal(job.errors[0].code, "rate_limit");
    assert.equal(Object.keys(job.results).length, 3);
    assert.equal(JSON.stringify(job).includes("Do not expose"), false);
    assert.equal(job.scope.text, undefined);
    assert.equal(
      (await db.collection("aiUsage").doc(uid).get()).data().activeUntil,
      0,
    );
  } finally {
    global.fetch = normal;
  }
});
