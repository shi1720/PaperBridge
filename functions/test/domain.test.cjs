const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../lib/domain.js");
test("request transitions distinguish offer from author-reported completion", () => {
  d.checkTransition("pending", "accepted", "reviewer");
  d.checkTransition("accepted", "endorsed", "requester");
  assert.throws(() => d.checkTransition("accepted", "endorsed", "reviewer"));
  assert.throws(() => d.checkTransition("pending", "endorsed", "requester"));
  assert.throws(() => d.checkTransition("withdrawn", "reviewing", "reviewer"));
});
test("withdrawal revokes private manuscript access", () => {
  const paper = { ownerId: "author", visibility: "private" };
  assert.equal(
    d.canReadPaper(paper, "reviewer", [
      { reviewerId: "reviewer", status: "reviewing" },
    ]),
    true,
  );
  assert.equal(
    d.canReadPaper(paper, "reviewer", [
      { reviewerId: "reviewer", status: "withdrawn" },
    ]),
    false,
  );
  assert.equal(
    d.canReadPaper(paper, "outsider", [
      { reviewerId: "reviewer", status: "reviewing" },
    ]),
    false,
  );
});
test("paths cannot escape the author and paper namespace", () => {
  assert.equal(
    d.storagePath("papers/alice/paper/main.pdf", "alice", "paper"),
    "papers/alice/paper/main.pdf",
  );
  for (const path of [
    "papers/bob/paper/main.pdf",
    "papers/alice/other/main.pdf",
    "papers/alice/paper/../main.pdf",
    "papers/alice/paper/main.html",
  ])
    assert.throws(() => d.storagePath(path, "alice", "paper"));
});
test("endorsement links cannot become arbitrary phishing links", () => {
  assert.equal(
    d.arxivUrl("https://arxiv.org/auth/endorse?x=1", true),
    "https://arxiv.org/auth/endorse?x=1",
  );
  for (const url of [
    "https://arxiv.org.evil.com/auth/endorse",
    "http://arxiv.org/auth/endorse",
    "javascript:alert(1)",
    "https://user@arxiv.org/auth/endorse",
    "https://arxiv.org/abs/123",
  ])
    assert.throws(() => d.arxivUrl(url, true));
});
test("availability requires explicit self-attested category eligibility", () => {
  const p = {
    name: "Reviewer",
    role: "endorser",
    categories: ["cs.AI"],
    acceptingRequests: true,
    weeklyCapacity: 3,
  };
  assert.throws(() => d.profileInput(p));
  assert.equal(
    d.profileInput({ ...p, eligibilitySelfAttested: true }).acceptingRequests,
    true,
  );
  assert.throws(() =>
    d.profileInput({ ...p, role: "researcher", eligibilitySelfAttested: true }),
  );
});
test("weekly quota resets Monday UTC, not browser locale", () => {
  assert.equal(
    new Date(d.weekStart(Date.parse("2026-09-20T23:59:59Z"))).toISOString(),
    "2026-09-14T00:00:00.000Z",
  );
  assert.equal(
    new Date(d.weekStart(Date.parse("2026-09-21T00:00:00Z"))).toISOString(),
    "2026-09-21T00:00:00.000Z",
  );
});
test("malformed and oversized input rejected", () => {
  assert.throws(() => d.identifier("../paper"));
  assert.throws(() => d.text("x".repeat(11), "value", 10));
  assert.throws(() => d.number(NaN, "capacity", 1, 10));
  assert.throws(() => d.category("cs.AI<script>"));
});

test("only canonical arXiv IDs are accepted and server taxonomy stays synchronized", () => {
  const { CATEGORY_IDS } = require("../lib/categories.js");
  const { readFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  const source = readFileSync(
    resolve(__dirname, "../../src/lib/categories.ts"),
    "utf8",
  );
  const canonical = [...source.matchAll(/\bid:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...CATEGORY_IDS], canonical);
  assert.equal(canonical.length, 155);
  for (const id of canonical) assert.equal(d.category(id), id);
  for (const bogus of ["cs.Bogus", "madeup.AI", "cs.ai", "physics.fake"])
    assert.throws(
      () => d.category(bogus),
      (e) => e.code === "invalid-argument",
    );
});
