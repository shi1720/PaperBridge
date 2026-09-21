import { test, expect } from "@playwright/test";

const base = "http://localhost:5173";
test("simulated expert review: desktop demo core journeys", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/?demo=1`);
  await expect(
    page.getByText("INTERACTIVE DEMO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Maya Chen", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/review-desktop-discover.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Search researchers" })
    .fill("Oliver");
  await expect(
    page.getByRole("button", { name: "Oliver Reed", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Maya Chen", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("link", { name: "My manuscripts", exact: true }).click();
  await page
    .getByRole("link")
    .filter({ hasText: "Sparse pathways" })
    .first()
    .click();
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  await expect(page.locator(".pb-text-layer")).toContainText(
    "FICTIONAL DEMONSTRATION MANUSCRIPT",
  );
  await page
    .getByLabel("Your note · page 1")
    .fill("Independent expert demo annotation.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText("Independent expert demo annotation.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/review-desktop-reader.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(
    page.getByText("Independent expert demo annotation.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Endorsement requests", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({ hasText: "Sparse pathways" })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Review comment" })
    .fill("Can we clarify the evaluation setup?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Can we clarify the evaluation setup?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Community", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your community post" })
    .fill("A simulated user-study post for functional validation.");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page.getByText("A simulated user-study post for functional validation.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await page
    .getByRole("combobox", { name: "Researcher", exact: true })
    .selectOption("demo-2");
  await page.getByRole("button", { name: "Open conversation" }).click();
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("Hello, a simulated workflow check.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .getByLabel("Conversation messages")
      .getByText("Hello, a simulated workflow check.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("simulated expert review: mobile surfaces and overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const results: { route: string; overflow: number }[] = [];
  for (const route of [
    "discover",
    "papers",
    "requests/demo-request",
    "review",
    "community",
    "messages",
    "settings",
    "impact",
  ]) {
    await page.goto(`${base}/${route}?demo=1`);
    await expect(
      page.getByText("INTERACTIVE DEMO", { exact: true }),
    ).toBeVisible();
    results.push({
      route,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    });
    if (
      ["discover", "settings", "review", "requests/demo-request"].includes(
        route,
      )
    )
      await page.screenshot({
        path: `test-results/review-mobile-${route.replaceAll("/", "-")}.png`,
        fullPage: true,
      });
  }
  console.log("Mobile overflow audit", JSON.stringify(results));
  expect(results.every((r) => r.overflow <= 1)).toBeTruthy();
});

test("follow state survives navigation and cancelled sharing consent is cleared", async ({
  page,
}) => {
  await page.goto(`${base}/?demo=1`);
  await page
    .getByRole("button", { name: "Follow Maya Chen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unfollow Maya Chen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Community", exact: true }).click();
  await page
    .getByRole("link", { name: "Find an endorser", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unfollow Maya Chen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const maya = page.locator(".person-card").filter({
    has: page.getByRole("button", { name: "Maya Chen", exact: true }),
  });
  await maya.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("I agree to share this manuscript").check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await maya.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByLabel("I agree to share this manuscript"),
  ).not.toBeChecked();
});
