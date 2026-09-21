const { test, after } = require("node:test");
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("This test requires Firestore emulator.");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-paperbridge" });
const db = getFirestore();
const nodemailer = require("nodemailer").default;
const original = nodemailer.createTransport;
let sends = 0;
let fail = false;
nodemailer.createTransport = () => ({
  sendMail: async () => {
    sends++;
    if (fail) throw new Error("Secret credential must never leak");
    return { accepted: ["test@example.test"], messageId: "provider-accepted" };
  },
  close() {},
});
const { processEmailOutbox } = require("../lib/email.js");
const fixtureOwner = "mail-test-" + Date.now();
process.env.SMTP_PASSWORD = "test-only-secret";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_USER = "test@example.test";
process.env.EMAIL_FROM = "test@example.test";
const seed = async (id) => {
  const ref = db.collection("emailWorkerFixtures").doc(fixtureOwner + "-" + id);
  await ref.set({
    userId: fixtureOwner,
    to: "test@example.test",
    subject: "Test",
    body: "Synthetic message",
    status: "queued",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  });
  return ref;
};
after(async () => {
  nodemailer.createTransport = original;
  const docs = await db
    .collection("emailWorkerFixtures")
    .where("userId", "==", fixtureOwner)
    .get();
  for (const doc of docs.docs) await doc.ref.delete();
  await deleteApp(app);
});
test("missing SMTP config stays queued and is never described as sent", async () => {
  const ref = await seed("missing");
  delete process.env.SMTP_HOST;
  const before = sends;
  await processEmailOutbox(ref);
  const job = (await ref.get()).data();
  assert.equal(job.status, "queued");
  assert.equal(job.sentAt, undefined);
  assert.equal(sends, before);
  assert.match(job.deliveryIssue, /configuration/);
  process.env.SMTP_HOST = "smtp.example.test";
});
test("concurrent delivery claims and duplicate trigger events send once", async () => {
  const ref = await seed("success");
  const before = sends;
  await Promise.all(Array.from({ length: 4 }, () => processEmailOutbox(ref)));
  await processEmailOutbox(ref);
  const job = (await ref.get()).data();
  assert.equal(sends, before + 1);
  assert.equal(job.status, "sent");
  assert.equal(job.providerMessageId, "provider-accepted");
});
test("SMTP errors retry with backoff, redact provider details, and terminate after eight attempts", async () => {
  const ref = await seed("failure");
  fail = true;
  await processEmailOutbox(ref);
  let job = (await ref.get()).data();
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 1);
  assert.ok(job.nextAttemptAt > Date.now());
  assert.equal(JSON.stringify(job).includes("Secret credential"), false);
  await ref.update({ attempts: 7, nextAttemptAt: 0 });
  await processEmailOutbox(ref);
  job = (await ref.get()).data();
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 8);
  fail = false;
});
