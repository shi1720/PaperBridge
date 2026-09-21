const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const nodemailer = require("nodemailer");
const { renderEmail, safeEmailAction } = require("../lib/email-template.js");
process.env.APP_URL = "https://paperbridge.web.app";
process.env.GCLOUD_PROJECT = "demo-paperbridge";
const job = {
  subject: "Verify your email for PaperBridge",
  body: "Plain-text verification\n\nhttps://demo-paperbridge.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=fixture",
  presentation: {
    eyebrow: "WELCOME TO PAPERBRIDGE",
    heading: "Your next chapter starts here.",
    intro: "Verify your email to return to your research.",
    actionLabel: "Verify email address",
    actionUrl:
      "https://demo-paperbridge.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=fixture",
    note: "Ignore this if you did not create an account.",
  },
};
test("branded MIME includes readable text, HTML and an embedded PNG without external image requests", async () => {
  const content = renderEmail(job);
  assert.equal(content.text, job.body);
  assert.match(content.html, /paperbridge<span/);
  assert.match(content.html, /cid:paperbridge-mark/);
  assert.match(content.html, /Verify email address/);
  assert.doesNotMatch(content.html, /<img[^>]+src="https?:/);
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const sent = await transport.sendMail({
    from: "test@example.test",
    to: "recipient@example.test",
    subject: job.subject,
    ...content,
    attachments: [
      {
        filename: "paperbridge-mark.png",
        path: path.join(__dirname, "../assets/paperbridge-mark.png"),
        cid: "paperbridge-mark",
        contentDisposition: "inline",
      },
    ],
  });
  const mime = sent.message.toString();
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain; charset=utf-8/);
  assert.match(mime, /text\/html; charset=utf-8/);
  assert.match(mime, /Content-ID: <paperbridge-mark>/);
  assert.match(mime, /image\/png/);
});
test("manuscript titles, people, labels and text are escaped instead of becoming email markup", () => {
  const attack = '<img src=x onerror="bad()"> & "quoted"';
  const { html } = renderEmail({
    ...job,
    subject: attack,
    presentation: {
      ...job.presentation,
      heading: attack,
      intro: attack,
      manuscript: attack,
      category: attack,
      note: attack,
      actionLabel: attack,
    },
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
  assert.match(html, /&amp; &quot;quoted&quot;/);
});
test("buttons reject external, credential-bearing, unsafe protocol and deceptive host links", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/reset",
    "https://paperbridge.web.app.evil.test/",
    "https://evil.test@paperbridge.web.app/",
    "http://paperbridge.web.app/",
    "https://demo-paperbridge.firebaseapp.com:444/__/auth/action",
    "https://paperbridge.web.app/redirect?url=https://evil.test",
  ]) {
    assert.equal(safeEmailAction(url), undefined);
    assert.doesNotMatch(
      renderEmail({
        ...job,
        presentation: { ...job.presentation, actionUrl: url },
      }).html,
      /href=/,
    );
  }
  assert.equal(
    safeEmailAction("https://paperbridge.web.app/requests/abc"),
    "https://paperbridge.web.app/requests/abc",
  );
});
test("legacy queued messages receive the same branded shell and retain their plain-text content", () => {
  const body =
    "A request update.\n\nhttps://paperbridge.web.app/requests/abc\n\nKeep your conversation private.";
  const { html, text } = renderEmail({
    subject: "PaperBridge: started reviewing",
    body,
  });
  assert.equal(text, body);
  assert.match(html, /A request update/);
  assert.match(html, /href="https:\/\/paperbridge.web.app\/requests\/abc"/);
  assert.match(html, /Open PaperBridge/);
});
