const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createUploadHandler,
  savePrivatePdf,
  MAX_PDF_BYTES,
  allowedUploadOrigin,
} = require("../lib/uploads");
const pdf = Buffer.from("%PDF-1.4\nFictional test PDF bytes\n%%EOF");
function harness(overrides = {}) {
  const events = [],
    saved = [];
  let next = 0;
  const deps = {
    verifyToken: async () => ({ uid: "owner" }),
    lease: async (uid, fn) => {
      events.push("lease-open");
      try {
        return await fn();
      } finally {
        events.push("lease-close");
      }
    },
    limit: async () => {},
    paper: async () => {
      events.push("paper-owner-check");
      return { ownerId: "owner" };
    },
    save: async (path, body) => {
      events.push("save");
      saved.push({ path, body });
    },
    uuid: () => `unique-${++next}`,
    originAllowed: (origin) =>
      !origin || origin === "https://paperbridge.web.app",
    ...overrides,
  };
  const response = {
    code: 200,
    headers: {},
    data: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(data) {
      this.data = data;
      events.push("respond");
    },
    send() {},
  };
  const request = {
    method: "POST",
    headers: {
      authorization: "Bearer fixture-token",
      "content-type": "application/pdf",
      origin: "https://paperbridge.web.app",
    },
    query: { paperId: "paper-1", fileName: "Draft.pdf" },
    rawBody: pdf,
  };
  return {
    request,
    response,
    events,
    saved,
    handle: createUploadHandler(deps),
  };
}
test("upload requires valid tenant authentication before any file or manuscript access", async () => {
  const h = harness({
    verifyToken: async () => {
      throw new Error("other tenant token detail must stay private");
    },
  });
  await h.handle(h.request, h.response);
  assert.equal(h.response.code, 401);
  assert.equal(h.saved.length, 0);
  assert.deepEqual(h.events, ["respond"]);
  assert.equal(JSON.stringify(h.response.data).includes("other tenant"), false);
});
test("upload binds server-chosen immutable paths to owner and holds deletion lease through storage save", async () => {
  const h = harness();
  await h.handle(h.request, h.response);
  assert.equal(h.response.code, 201);
  assert.equal(
    h.response.data.data.storagePath,
    "papers/owner/paper-1/unique-1.pdf",
  );
  assert.deepEqual(h.events, [
    "lease-open",
    "paper-owner-check",
    "save",
    "lease-close",
    "respond",
  ]);
  assert.equal(h.response.data.data.fileName, "Draft.pdf");
  await h.handle(h.request, h.response);
  assert.equal(h.saved[1].path, "papers/owner/paper-1/unique-2.pdf");
});
test("foreign manuscripts, deleting accounts and forged upload names cannot write", async () => {
  const foreign = harness({ paper: async () => ({ ownerId: "other" }) });
  await foreign.handle(foreign.request, foreign.response);
  assert.equal(foreign.response.code, 403);
  assert.equal(foreign.saved.length, 0);
  const deleting = harness({
    lease: async () => {
      const e = new (require("firebase-functions/v2/https").HttpsError)(
        "failed-precondition",
        "Deleting",
      );
      throw e;
    },
  });
  await deleting.handle(deleting.request, deleting.response);
  assert.equal(deleting.response.code, 409);
  assert.equal(deleting.saved.length, 0);
  const path = harness();
  path.request.query.paperId = "../other";
  await path.handle(path.request, path.response);
  assert.equal(path.response.code, 400);
  assert.equal(path.saved.length, 0);
});
test("server rejects oversized, disguised non-PDF and compressed bodies independently of browser checks", async () => {
  for (const [body, type, encoding] of [
    [Buffer.alloc(MAX_PDF_BYTES + 1), "application/pdf", undefined],
    [Buffer.from("<html>not pdf</html>"), "application/pdf", undefined],
    [pdf, "text/html", undefined],
    [pdf, "application/pdf", "gzip"],
  ]) {
    const h = harness();
    h.request.rawBody = body;
    h.request.headers["content-type"] = type;
    if (encoding) h.request.headers["content-encoding"] = encoding;
    await h.handle(h.request, h.response);
    assert.equal(h.response.code, 400);
    assert.equal(h.saved.length, 0);
  }
});
test("production storage writes enforce create-only generation and never generate Firebase download tokens", async () => {
  let options;
  await savePrivatePdf(
    {
      save: async (body, value) => {
        assert.equal(body, pdf);
        options = value;
      },
    },
    pdf,
  );
  assert.deepEqual(options.preconditionOpts, { ifGenerationMatch: 0 });
  assert.deepEqual(options.metadata.metadata, {});
  assert.match(options.metadata.cacheControl, /no-store/);
  assert.equal(options.metadata.contentType, "application/pdf");
  assert.equal(options.resumable, false);
});
test("untrusted origins fail before auth and preflight only allows configured origin", async () => {
  const h = harness();
  h.request.headers.origin = "https://attacker.example";
  await h.handle(h.request, h.response);
  assert.equal(h.response.code, 403);
  assert.equal(h.events.length, 1);
  const pre = harness();
  pre.request.method = "OPTIONS";
  await pre.handle(pre.request, pre.response);
  assert.equal(pre.response.code, 204);
  assert.equal(
    pre.response.headers["Access-Control-Allow-Origin"],
    "https://paperbridge.web.app",
  );
  assert.equal(pre.saved.length, 0);
});
test("storage errors cannot disclose service credentials or object internals", async () => {
  const h = harness({
    save: async () => {
      throw new Error("credential and bucket details");
    },
  });
  await h.handle(h.request, h.response);
  assert.equal(h.response.code, 500);
  assert.equal(JSON.stringify(h.response.data).includes("credential"), false);
  assert.ok(h.events.includes("lease-close"));
});
