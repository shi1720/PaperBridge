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
let closes = 0;
let lastMessage;
let lastTransportOptions;
let fail = false;
nodemailer.createTransport = (options) => {
  lastTransportOptions = options;
  return {
    sendMail: async (message) => {
      lastMessage = message;
      sends++;
      if (fail)
        throw Object.assign(new Error("Secret credential must never leak"), {
          code: "EAUTH",
          responseCode: 535,
        });
      return {
        accepted: ["test@example.test"],
        messageId: "provider-accepted",
      };
    },
    close() {
      closes++;
    },
  };
};
const { processEmailOutbox } = require("../lib/email.js");
const fixtureOwner = "mail-test-" + Date.now();
const fixtureCollection = "emailWorkerFixtures_" + Date.now();
const fixtureCollections = new Set([fixtureCollection]);
const originalLimits = {
  hourly: process.env.EMAIL_HOURLY_LIMIT,
  daily: process.env.EMAIL_DAILY_LIMIT,
  monthly: process.env.EMAIL_MONTHLY_LIMIT,
};
process.env.EMAIL_HOURLY_LIMIT = "1000";
process.env.EMAIL_DAILY_LIMIT = "1000";
process.env.EMAIL_MONTHLY_LIMIT = "1000";
process.env.PAPERBRIDGE_SMTP_PASSWORD = "test-only-secret";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_USER = "test@example.test";
process.env.EMAIL_FROM = "test@example.test";
const seed = async (id, collection = fixtureCollection) => {
  fixtureCollections.add(collection);
  const ref = db.collection(collection).doc(fixtureOwner + "-" + id);
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
  for (const collection of fixtureCollections) {
    const docs = await db
      .collection(collection)
      .where("userId", "==", fixtureOwner)
      .get();
    for (const doc of docs.docs) await doc.ref.delete();
    const budgets = await db
      .collection("emailBudgets")
      .where("scope", "==", collection)
      .get();
    for (const doc of budgets.docs) await doc.ref.delete();
  }
  for (const [suffix, value] of Object.entries({
    HOURLY: originalLimits.hourly,
    DAILY: originalLimits.daily,
    MONTHLY: originalLimits.monthly,
  })) {
    if (value === undefined) delete process.env["EMAIL_" + suffix + "_LIMIT"];
    else process.env["EMAIL_" + suffix + "_LIMIT"] = value;
  }
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
  assert.equal(job.attempts, 1);
  assert.match(lastMessage.messageId, /@example[.]test>$/);
  assert.equal(lastTransportOptions.secure, true);
  assert.match(lastMessage.html, /cid:paperbridge-mark/);
  assert.equal(lastMessage.text, "Synthetic message");
  assert.equal(lastMessage.attachments[0].cid, "paperbridge-mark");
});
test("SMTP errors retry with backoff, redact provider details, and terminate after eight attempts", async () => {
  const ref = await seed("failure");
  fail = true;
  const beforeCloses = closes;
  await processEmailOutbox(ref);
  assert.equal(closes, beforeCloses + 1);
  let job = (await ref.get()).data();
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 1);
  assert.ok(job.nextAttemptAt > Date.now());
  assert.equal(JSON.stringify(job).includes("Secret credential"), false);
  assert.equal(job.providerErrorCode, "EAUTH");
  assert.equal(job.providerResponseCode, 535);
  await ref.update({ attempts: 7, nextAttemptAt: 0 });
  await processEmailOutbox(ref);
  job = (await ref.get()).data();
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 8);
  assert.match(job.deliveryIssue, /Administrator review/);
  assert.equal(job.deliveryIssue.includes("automatically"), false);
  const before = sends;
  await processEmailOutbox(ref);
  assert.equal(sends, before);
  fail = false;
});

test("exhausted queued jobs do not make a ninth SMTP attempt", async () => {
  const ref = await seed("exhausted");
  await ref.update({ attempts: 8 });
  const before = sends;
  await processEmailOutbox(ref);
  assert.equal(sends, before);
  const job = (await ref.get()).data();
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 8);
});
test("concurrent messages reserve app-wide allowance without exceeding it", async () => {
  process.env.EMAIL_HOURLY_LIMIT = "2";
  const collection = fixtureCollection + "_capacity";
  const refs = await Promise.all(
    Array.from({ length: 6 }, (_, i) => seed("capacity" + i, collection)),
  );
  const before = sends;
  await Promise.all(refs.map((ref) => processEmailOutbox(ref)));
  const jobs = await Promise.all(
    refs.map(async (ref) => (await ref.get()).data()),
  );
  assert.equal(sends, before + 2);
  assert.equal(jobs.filter((j) => j.status === "sent").length, 2);
  for (const job of jobs.filter((j) => j.status === "queued")) {
    assert.equal(job.attempts, 0);
    assert.equal(job.deliveryCode, "sending_allowance");
    assert.ok(job.nextAttemptAt > Date.now());
  }
  const budgets = await db
    .collection("emailBudgets")
    .where("scope", "==", collection)
    .get();
  assert.equal(budgets.size, 3);
  assert.ok(budgets.docs.every((d) => d.data().count === 2));
  process.env.EMAIL_HOURLY_LIMIT = "1000";
});
test("zero monthly allowance defers until the monthly reset without consuming an attempt", async () => {
  process.env.EMAIL_MONTHLY_LIMIT = "0";
  const ref = await seed("monthly", fixtureCollection + "_monthly");
  const before = sends;
  await processEmailOutbox(ref);
  const job = (await ref.get()).data();
  const now = new Date();
  assert.equal(sends, before);
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 0);
  assert.equal(
    job.nextAttemptAt,
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) + 1000,
  );
  process.env.EMAIL_MONTHLY_LIMIT = "1000";
});
