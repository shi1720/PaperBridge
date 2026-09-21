import { test, expect } from "@playwright/test";

const origin = process.env.PUBLIC_HOME_URL || "http://localhost:5173";

test("public homepage navigation works on phones, tablets and short landscape", async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [820, 1180],
    [1024, 768],
    [667, 375],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(origin);
    await expect(page.locator(".landing h1")).toBeVisible();
    const navigation = page.getByRole("navigation", {
      name: "Public navigation",
    });
    const toggle = page.getByRole("button", { name: "Open navigation" });
    if (width <= 900) {
      await expect(navigation).toBeHidden();
      await toggle.click();
      await expect(
        page.getByRole("button", { name: "Close navigation" }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(navigation).toBeVisible();
      // The entire expanded menu remains usable even in phone landscape.
      expect((await navigation.boundingBox())!.y).toBeGreaterThanOrEqual(0);
      const menu = (await navigation.boundingBox())!;
      expect(menu.y + menu.height).toBeLessThanOrEqual(height);
      await navigation.getByRole("link", { name: "AI review" }).focus();
      await page.keyboard.press("Escape");
      await expect(navigation).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
    } else {
      await expect(toggle).toBeHidden();
      await expect(navigation).toBeVisible();
    }
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      smallTargets: [
        ...document.querySelectorAll(
          ".landing a, .landing button, .landing summary",
        ),
      ]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && (bounds.width < 44 || bounds.height < 44);
        })
        .map((element) => element.textContent?.trim()),
    }));
    expect(
      layout.overflow,
      `${width}×${height} page overflow`,
    ).toBeLessThanOrEqual(1);
    expect(layout.smallTargets, `${width}×${height} touch targets`).toEqual([]);
    await navigation
      .getByRole("link", { name: "Community", exact: true })
      .click();
    await expect(page).toHaveURL(/#community$/);
    await expect(page.locator("#community h2")).toBeInViewport();
    if (width <= 900) {
      await expect(navigation).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
  }
});
