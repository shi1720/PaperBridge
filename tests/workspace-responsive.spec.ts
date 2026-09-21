import { test, expect, type Page } from "@playwright/test";

const base = "http://localhost:5173";
const sizes = [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 844, height: 390 },
  { width: 1180, height: 820 },
];
async function loaded(page: Page, route: string) {
  await page.goto(`${base}/${route}${route.includes("?") ? "&" : "?"}demo=1`);
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("main .loading")).toHaveCount(0);
  if (route === "papers/demo-paper")
    await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
}
async function contained(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  // Also catch controls clipped by a parent's overflow:hidden. Intentional carousels
  // and PDF pan regions remain scrollable and are checked in their workflow tests.
  const clipped = await page
    .locator("main button, main input, main select, main textarea, main a")
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        if (
          bounds.width <= 2 ||
          bounds.height <= 2 ||
          !element.checkVisibility()
        )
          return [];
        for (
          let parent = element.parentElement;
          parent && parent.tagName !== "MAIN";
          parent = parent.parentElement
        ) {
          if (
            ["auto", "scroll"].includes(getComputedStyle(parent).overflowX) &&
            parent.scrollWidth > parent.clientWidth + 1
          )
            return [];
        }
        return bounds.left < -1 || bounds.right > innerWidth + 1
          ? [
              element.getAttribute("aria-label") ||
                element.textContent?.trim().slice(0, 70) ||
                element.tagName,
            ]
          : [];
      }),
    );
  expect(clipped).toEqual([]);
}
for (const viewport of sizes) {
  test(`workspace routes fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "discover",
      "papers",
      "papers/demo-paper",
      "requests",
      "requests/demo-request",
      "requests/demo-request?tab=activity",
      "review",
      "community",
      "researchers",
      "researchers/demo-1",
      "messages",
      "settings",
      "settings?tab=ai",
      "impact",
    ]) {
      await test.step(route, async () => {
        await loaded(page, route);
        await contained(page);
      });
    }
    expect(errors).toEqual([]);
  });
}

test("tablet drawer remains reachable in landscape, traps focus and resets after resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await loaded(page, "papers");
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
    includeHidden: true,
  });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab"); // brand, then cycle to last account control
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("#workspace-navigation"),
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Settings & privacy", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".sidebar-scrim")).toHaveCount(0);
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert");
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("phone PDF controls stay usable and note drafts survive orientation changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loaded(page, "papers/demo-paper");
  const draft = page.getByLabel("Your note · page 1", { exact: true });
  await draft.fill("Check the comparison after rotating the screen.");
  const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
  const bounds = await zoom.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await zoom.click();
  await page
    .getByRole("button", { name: "Fit page width", exact: true })
    .click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(draft).toHaveValue(
    "Check the comparison after rotating the screen.",
  );
  await expect
    .poll(() =>
      page
        .locator(".pb-reader-scroll")
        .evaluate((el) => el.scrollWidth - el.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.locator(".pb-note")).toContainText(
    "Check the comparison after rotating the screen.",
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByLabel("Search notes", { exact: true }).fill("rotating");
  await expect(page.locator(".pb-note")).toBeVisible();
  await contained(page);
});

test("narrow settings sections and collaboration actions remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loaded(page, "settings?tab=ai");
  const privacy = page.getByRole("button", {
    name: "Privacy & account",
    exact: true,
  });
  const bounds = await privacy.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await privacy.click();
  await expect(
    page.getByRole("heading", { name: "Control your footprint" }),
  ).toBeVisible();
  await loaded(page, "requests/demo-request");
  await page
    .getByRole("textbox", { name: "Review comment" })
    .fill("A mobile workspace discussion.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("A mobile workspace discussion.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manuscript & notes", exact: true })
    .click();
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  await contained(page);
  await page
    .getByRole("button", { name: "Activity & revisions", exact: true })
    .click();
  await contained(page);
});
