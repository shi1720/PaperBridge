import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = [
  "discover",
  "requests",
  "papers",
  "community",
  "researchers",
  "researchers/demo-1",
  "review",
  "settings",
  "impact",
  "messages",
  "papers/demo-paper",
  "requests/demo-request",
  "requests/demo-request?tab=activity",
  "settings?tab=ai",
];
for (const width of [1440, 390]) {
  test(`loaded research surfaces have no serious WCAG A/AA violations at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of routes) {
      await page.goto(
        `http://localhost:5173/${route}${route.includes("?") ? "&" : "?"}demo=1`,
      );
      // Inspect content, not a transient loading shell, especially on lazy routes.
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("main .loading")).toHaveCount(0);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      );
      expect
        .soft(
          serious.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          `${route} at ${width}px`,
        )
        .toEqual([]);
    }
  });
}
