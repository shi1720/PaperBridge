import { expect, test } from "@playwright/test";

const base = "http://localhost:5173";
for (const [width, height] of [
  [320, 740],
  [375, 812],
  [768, 1024],
  [1440, 1000],
]) {
  test(`activity and conversations remain usable at ${width}x${height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/notifications?demo=1`);
    await expect(
      page.getByRole("region", { name: "Activity inbox" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark all as read", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("activity-inbox.png"),
      fullPage: true,
    });

    await page.goto(`${base}/messages?demo=1`);
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("combobox").selectOption("demo-1");
    await page
      .getByRole("button", { name: "Open conversation", exact: true })
      .click();
    await expect(
      page.getByLabel("Your message", { exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Your message", { exact: true })
      .fill("A thoughtful introduction on a small screen.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByLabel("Conversation messages")).toContainText(
      "A thoughtful introduction on a small screen.",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("conversation.png"),
      fullPage: true,
    });
    if (width <= 780) {
      await expect(page.locator(".chat-sidebar")).toBeHidden();
      await page
        .getByRole("button", { name: "Back to conversations", exact: true })
        .click();
      await expect(page.getByLabel("Search conversations")).toBeVisible();
      await expect(page.locator(".chat-thread")).toBeHidden();
    }
  });
}
