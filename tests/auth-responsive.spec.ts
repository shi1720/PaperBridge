import { test, expect } from "@playwright/test";

test("signup and privacy remain usable on a small phone, iPad and phone landscape", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 820, height: 1180 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("http://localhost:5174");
    await page
      .getByRole("button", { name: "Join as an endorser", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Create your account", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "I can help endorse" }).click();
    const name = page.getByLabel("Full name", { exact: true });
    await name.fill("Responsive signup check");
    const dialog = page.getByRole("dialog");
    expect(
      await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await page
      .getByRole("button", { name: "Read guidelines & privacy", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "A thoughtful place for research",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(name).toHaveValue("Responsive signup check");
    await expect(
      page.getByRole("button", { name: "I can help endorse" }),
    ).toHaveClass(/selected/);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
