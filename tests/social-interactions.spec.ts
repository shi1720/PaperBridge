import { expect, test, type Page } from "@playwright/test";

const base = "http://localhost:5173";
async function openConversation(page: Page, id: string) {
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("combobox").selectOption(id);
  await page
    .getByRole("button", { name: "Open conversation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Your message", { exact: true })).toBeEnabled();
}

test("conversation drafts survive switching, messages send with keyboard, and search finds the thread", async ({
  page,
}) => {
  await page.goto(`${base}/messages?demo=1`);
  await openConversation(page, "demo-1");
  await page
    .getByLabel("Your message", { exact: true })
    .fill("A draft about evaluation protocols.");
  await openConversation(page, "demo-2");
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Draft for Oliver.");
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Maya Chen" })
    .click();
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue(
    "A draft about evaluation protocols.",
  );
  await page.getByLabel("Your message", { exact: true }).press("Control+Enter");
  await expect(page.getByLabel("Conversation messages")).toContainText(
    "A draft about evaluation protocols.",
  );
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("Search conversations").fill("evaluation");
  await expect(page.locator(".chat-list-item")).toHaveCount(1);
  await expect(page.locator(".chat-list-item")).toContainText("Maya Chen");
  await page.getByLabel("Search conversations").fill("");
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Oliver Reed" })
    .click();
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue(
    "Draft for Oliver.",
  );
  await expect(page.getByLabel("Conversation messages")).not.toContainText(
    "A draft about evaluation protocols.",
  );
});

test("following is reflected in the researcher network and can be undone from a profile", async ({
  page,
}) => {
  await page.goto(`${base}/researchers/demo-1?demo=1`);
  await page
    .getByRole("button", { name: "Follow researcher", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("link", { name: "All researchers", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Researcher network" })
    .getByRole("button", { name: /Following/ })
    .click();
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Maya Chen", exact: true }).click();
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Follow researcher", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("activity filters updates and marks one read without dismissing other unread items", async ({
  page,
}) => {
  await page.route("**/src/lib/demo.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'case "notifications.list":',
      `case "notifications.list":
      if (notifications[0]) notifications[0].emailStatus = "queued";
      if (!notifications.some(x => x.id === "fixture-message")) notifications.push(
        { id: "fixture-message", title: "New message", body: "Maya sent you a message.", link: "/messages?chat=fixture-chat", createdAt: Date.now(), read: false },
        { id: "fixture-connection", title: "New connection", body: "Oliver followed your work.", link: "/researchers/demo-2", createdAt: Date.now(), read: false }
      );`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/notifications?demo=1`);
  await expect(page.locator(".activity-item")).toHaveCount(3);
  await expect(page.getByLabel("Email notification status")).toContainText(
    "Email: queued",
  );
  await expect(page.locator(".activity-title")).toContainText(
    "3 unread updates",
  );
  await page.getByLabel("Filter activity type").selectOption("message");
  await expect(page.locator(".activity-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.locator(".activity-title")).toContainText(
    "2 unread updates",
  );
  await page.getByRole("button", { name: /^Unread/ }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing waiting here" }),
  ).toBeVisible();
  await page.getByLabel("Filter activity type").selectOption("all");
  await expect(page.locator(".activity-item")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(page.locator(".activity-title")).toContainText(
    "You’re all caught up",
  );
  await page.getByRole("button", { name: "All updates", exact: true }).click();
  await expect(page.locator(".activity-item")).toHaveCount(3);
  await page
    .locator(".activity-item")
    .filter({ hasText: "New connection" })
    .getByRole("link", { name: "Open update" })
    .click();
  await expect(page).toHaveURL(/\/researchers\/demo-2/);
  await expect(
    page.getByRole("heading", { name: "Oliver Reed", exact: true }),
  ).toBeVisible();
});

test("an empty visibility scan can continue to older community posts", async ({
  page,
}) => {
  await page.route("**/src/lib/demo.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'case "feed.list": {',
      `case "feed.list": {
      if (p.includePageInfo && !p.following && !p.saved) return p.cursor
        ? { posts: [feed[0]], nextCursor: null, hasMore: false }
        : { posts: [], nextCursor: { createdAt: 100, id: "scan-boundary" }, hasMore: true };`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/community?demo=1`);
  await expect(
    page.getByRole("heading", { name: "More research is ahead" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next posts", exact: true }).click();
  await expect(page.locator(".social-post")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Community feed pages" }),
  ).toContainText("Page 2");
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "More research is ahead" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next posts", exact: true }).click();
  await page
    .getByRole("group", { name: "Feed filter" })
    .getByRole("button", { name: /^Following/ })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Community feed pages" }),
  ).toHaveCount(0);
});

test("a discussion link opens the conversation without burying it below a composer", async ({
  page,
}) => {
  await page.goto(`${base}/community?demo=1#post-post-1`);
  await expect(page.locator(".social-post")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Post discussion" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your community post")).toHaveCount(0);
  await expect(page.getByLabel("Add a thoughtful reply")).toBeVisible();
  await page.getByRole("link", { name: /Back to the community feed/ }).click();
  await expect(page.getByLabel("Your community post")).toBeVisible();
});
