import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = "http://localhost:5173";

test("overview leads to real manuscript actions, request workspace, activity, and profile", async ({
  page,
}) => {
  await page.goto(`${base}/?demo=1`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little progress",
  );
  await expect(
    page.locator(".home-stat").filter({ hasText: "Your manuscripts" }),
  ).toContainText("1");
  await page.getByRole("link", { name: "Add manuscript", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Paper title")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await page.locator(".home-request").click();
  await expect(page).toHaveURL(/\/requests\/demo-request/);
  await expect(
    page.getByRole("textbox", { name: "Review comment" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByLabel("Activity inbox")).toBeVisible();
  await page.getByRole("link", { name: "View your profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Alex Morgan", exact: true }),
  ).toBeVisible();
});

test("overview and activity have no serious accessibility violations", async ({
  page,
}) => {
  for (const route of ["", "notifications"]) {
    await page.goto(`${base}/${route}?demo=1`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main .loading")).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => ["serious", "critical"].includes(v.impact || ""))
        .map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.failureSummary),
        })),
    ).toEqual([]);
  }
});
