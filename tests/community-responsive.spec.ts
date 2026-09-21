import { test, expect, type Page } from "@playwright/test";

const base = "http://localhost:5173";
const sizes = [
  [320, 740],
  [375, 812],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [844, 390],
];
const assets = [
  {
    id: "responsive-image",
    kind: "image",
    fileName:
      "ResearchFigureWithAnUnbrokenVeryLongFilenameForResponsiveTesting.png",
    size: 1500,
    contentType: "image/png",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGWoAAAAASUVORK5CYII=",
  },
  {
    id: "responsive-pdf",
    kind: "pdf",
    fileName:
      "ManuscriptWithAnUnbrokenVeryLongFilenameForResponsiveTesting.pdf",
    size: 4000,
    contentType: "application/pdf",
    url: "/demo-manuscript.pdf",
  },
];

async function prepareMedia(page: Page) {
  // Isolated browser fixture: production and the source demo data stay untouched.
  await page.route("**/src/lib/demo.ts*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'case "profile.get":',
      `case "media.get": return ${JSON.stringify(assets)}.find(x => x.id === p.id); case "profile.get":`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/community?demo=1`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async (attachments) => {
    const path = "/src/lib/demo.ts";
    const { demoCall } = await import(path);
    await demoCall("feed.post", {
      body: "A local responsive attachment fixture.",
      postType: "paper",
      attachments,
    });
  }, assets);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".post-pdf-card").first()).toBeVisible();
}

async function expectContainedDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const close = element
      .querySelector('[aria-label="Close"]')!
      .getBoundingClientRect();
    return {
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      insideViewport:
        box.x >= 0 &&
        box.y >= 0 &&
        box.right <= innerWidth + 1 &&
        box.bottom <= innerHeight + 1,
      closeContained:
        close.x >= box.x &&
        close.right <= box.right &&
        close.y >= box.y &&
        close.bottom <= box.bottom,
      closeHeight: close.height,
    };
  });
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.insideViewport).toBeTruthy();
  expect(geometry.closeContained).toBeTruthy();
  expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);
}

for (const [width, height] of sizes) {
  test(`community media and profile fit ${width}x${height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await prepareMedia(page);
    const smallActionTargets = await page
      .locator(".social-post-actions button")
      .evaluateAll(
        (buttons) =>
          buttons.filter((button) => button.getBoundingClientRect().height < 44)
            .length,
      );
    expect(smallActionTargets).toBe(0);

    await page
      .getByRole("button", { name: /View image 1:/ })
      .first()
      .click();
    await expectContainedDialog(page);
    await expect(
      page.getByRole("link", { name: "Open image", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("image-dialog.png") });
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.locator(".post-pdf-card").first().click();
    await expect(page.locator(".community-pdf canvas")).toHaveAttribute(
      "width",
      /[1-9]\d*/,
    );
    await expect(page.getByText("Loading PDF…", { exact: true })).toHaveCount(
      0,
    );
    await expectContainedDialog(page);
    const scroller = page.locator(".community-pdf-canvas");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Close", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("pdf-dialog.png") });
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page
      .getByRole("button", { name: "Edit post", exact: true })
      .first()
      .click();
    await expectContainedDialog(page);
    const form = page.getByRole("dialog").locator("form");
    await form.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Close", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("edit-dialog.png") });
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.goto(`${base}/researchers/demo-1?demo=1`);
    const heading = page.locator(".researcher-profile-identity h1");
    await expect(heading).toBeVisible();
    const cover = await page.locator(".researcher-profile-cover").boundingBox();
    const name = await heading.boundingBox();
    expect(name!.y).toBeGreaterThanOrEqual(cover!.y + cover!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("profile.png"),
      fullPage: true,
    });

    await page.goto(`${base}/settings?demo=1`);
    await expect(
      page.getByRole("heading", { name: "Your profile photo" }),
    ).toBeVisible();
    const photo = await page.locator(".profile-photo-editor").boundingBox();
    expect(photo!.x + photo!.width).toBeLessThanOrEqual(width + 1);
    expect(
      await page
        .locator(".profile-photo-editor")
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test("community PDF refits after rotating a phone without losing its page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await prepareMedia(page);
  await page.locator(".post-pdf-card").first().click();
  const canvas = page.locator(".community-pdf canvas");
  await expect(canvas).toHaveAttribute("width", /[1-9]\d*/);
  const narrow = (await canvas.boundingBox())!.width;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(narrow * 1.5);
  await expect(page.locator(".community-pdf-toolbar")).toContainText("Page 1");
  await expectContainedDialog(page);
  await expect(
    page.getByRole("link", { name: "Download PDF", exact: true }),
  ).toBeInViewport();
});
