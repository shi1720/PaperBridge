const { chromium, expect } = require("@playwright/test");
(async () => {
  const origin = process.env.PREVIEW_URL || "https://paperbridge.web.app";
  const response = await fetch(origin);
  if (!response.ok) throw Error("Hosting unavailable");
  for (const name of [
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
  ])
    if (!response.headers.get(name))
      throw Error("Missing security header " + name);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const failures = [];
    page.on("pageerror", (e) => failures.push(e.message));
    await page.goto(origin);
    await expect(page.locator(".landing h1")).toContainText(
      "Build a stronger paper.",
    );
    await expect(
      page.getByRole("button", { name: "I’m working on a paper", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join as an endorser", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/paperbridge-hosted-home.png",
      fullPage: true,
    });
    for (const route of [
      "/?demo=1",
      "/discover?demo=1",
      "/community?demo=1",
      "/papers/demo-paper?demo=1",
    ]) {
      await page.goto(origin + route);
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
    await page.goto(origin + "/discover");
    await expect(
      page.getByRole("heading", {
        name: "Find a connection in your field",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(origin + "/community");
    await expect(
      page.getByRole("heading", {
        name: "Find your research community",
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await expect(page.locator(".landing h1")).toBeVisible();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw Error("Mobile homepage overflows");
    await page.screenshot({
      path: "/tmp/paperbridge-hosted-home-mobile.png",
      fullPage: true,
    });
    if (failures.length) throw Error(failures.join("; "));
    console.log(
      JSON.stringify({
        url: origin,
        status: response.status,
        securityHeaders: true,
        publicHomepage: true,
        fictionalProductionData: false,
        signedOutStates: true,
        mobileOverflow: false,
        runtimeErrors: 0,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
