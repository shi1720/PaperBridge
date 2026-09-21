const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  emailLimits,
  emailWindows,
  senderMessageId,
} = require("../lib/email-budget.js");
test("free-tier defaults remain bounded and invalid environment values do not remove limits", () => {
  assert.deepEqual(emailLimits({}), { hourly: 50, daily: 250, monthly: 7000 });
  assert.deepEqual(
    emailLimits({
      EMAIL_HOURLY_LIMIT: "0",
      EMAIL_DAILY_LIMIT: "not-a-number",
      EMAIL_MONTHLY_LIMIT: "1000001",
    }),
    { hourly: 0, daily: 250, monthly: 7000 },
  );
  assert.equal(emailLimits({ EMAIL_HOURLY_LIMIT: "25" }).hourly, 25);
});
test("sending allowance windows reset at UTC hour/day/calendar-month boundaries", () => {
  const windows = emailWindows(Date.parse("2028-02-29T23:59:59Z"), {
    hourly: 25,
    daily: 200,
    monthly: 1000,
  });
  assert.ok(
    windows.every(
      (w) => new Date(w.end).toISOString() === "2028-03-01T00:00:00.000Z",
    ),
  );
  assert.equal(
    new Date(windows[2].start).toISOString(),
    "2028-02-01T00:00:00.000Z",
  );
});
test("stable message IDs use the configured sender hostname rather than an unrelated domain", () => {
  assert.equal(
    senderMessageId("abc", "PaperBridge <verified@example.com>"),
    "<abc@example.com>",
  );
  assert.equal(
    senderMessageId("abc", "verified@example.com"),
    "<abc@example.com>",
  );
});
