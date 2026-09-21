import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const origin = process.env.PUBLIC_HOME_URL || "http://localhost:5173";
test("account entry exposes privacy details and preserves the signup intent", async ({
  page,
}) => {
  const accountOrigin = process.env.PUBLIC_AUTH_URL || "http://localhost:5174";
  await page.goto(accountOrigin);
  await page
    .getByRole("button", { name: "Join as an endorser", exact: true })
    .click();
  await page.getByRole("button", { name: "I can help endorse" }).click();
  const policy = page.getByRole("button", {
    name: "Read guidelines & privacy",
    exact: true,
  });
  await expect(policy).toBeVisible();
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Policy navigation check");
  await policy.click();
  await expect(
    page.getByRole("heading", {
      name: "A thoughtful place for research",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Report unwanted contact", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "I can help endorse" }),
  ).toHaveClass(/selected/);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Policy navigation check",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(accountOrigin + "/discover");
  await page
    .getByRole("button", { name: "Find potential endorsers", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("public home explains the real workflow without invented activity", async ({
  page,
}) => {
  await page.goto(origin);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Build a stronger paper.",
  );
  await expect(
    page.getByRole("button", {
      name: "Create your research profile",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join as an endorser", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("INTERACTIVE DEMO", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(/Maya Chen|Alex Morgan|Oliver Reed|fictional/i),
  ).toHaveCount(0);
  await expect(
    page
      .getByText("PaperBridge is independent of arXiv.", { exact: false })
      .first(),
  ).toBeVisible();
  await expect(
    page.locator(".lp-workspace button, .lp-workspace a"),
  ).toHaveCount(0);
  await page
    .locator(".landing-header")
    .getByRole("link", { name: "Community", exact: true })
    .click();
  await expect(page).toHaveURL(/#community$/);
  await page
    .getByRole("link", { name: "Explore the research community", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Find your research community",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(origin);
  await page
    .getByRole("link", { name: "Find endorsement support", exact: true })
    .click();
  await expect(page).toHaveURL(/#find-endorsers$/);
  await expect(
    page.getByText("Sign in to view participating profiles.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create your research profile", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (
    await dialog
      .getByText("Account registration is not open yet", { exact: true })
      .count()
  ) {
    await expect(dialog.getByRole("button", { name: /demo/i })).toHaveCount(0);
    await expect(dialog.getByText(/No account has been created/)).toBeVisible();
  } else {
    await expect(
      dialog.getByRole("button", { name: "I’m a researcher" }),
    ).toHaveAttribute("aria-pressed", "false");
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Join as an endorser", exact: true })
    .click();
  if (
    await dialog.getByRole("button", { name: "I can help endorse" }).count()
  ) {
    await expect(
      dialog.getByRole("button", { name: "I can help endorse" }),
    ).toHaveAttribute("aria-pressed", "false");
  }
});

test("public homepage is readable and fits desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(origin);
    await expect(page.locator(".landing h1")).toBeVisible();
    await expect(
      page.getByText("Illustrative workspace", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Illustrative output", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/home-redesign/home-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations
        .filter((v) => ["serious", "critical"].includes(v.impact || ""))
        .map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.failureSummary),
        })),
    ).toEqual([]);
  }
});

test("signed-out directory and feed show real participation gates", async ({
  page,
}) => {
  await page.goto(origin + "/discover");
  await expect(
    page.getByRole("heading", {
      name: "Find a connection in your field",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".person-card")).toHaveCount(0);
  await page.goto(origin + "/community");
  await expect(
    page.getByRole("heading", {
      name: "Find your research community",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".social-post")).toHaveCount(0);
});

test("production rejects demo query parameters on every public entry", async ({
  page,
}) => {
  const production = process.env.PRODUCTION_HOME_URL;
  test.skip(
    !production,
    "Run against a production Vite build using PRODUCTION_HOME_URL.",
  );
  for (const route of [
    "/?demo=1",
    "/discover?demo=1",
    "/community?demo=1",
    "/papers/demo-paper?demo=1",
  ]) {
    await page.goto(production! + route);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByText("INTERACTIVE DEMO", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Maya Chen|Alex Morgan|Oliver Reed|fictional/i),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /explore.*demo/i }),
    ).toHaveCount(0);
    await expect(page.locator(".person-card,.social-post")).toHaveCount(0);
  }
});
