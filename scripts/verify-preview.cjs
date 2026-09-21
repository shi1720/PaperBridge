const { chromium } = require("@playwright/test");
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
    await page.getByText("INTERACTIVE DEMO", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Maya Chen", exact: true })
      .waitFor();
    await page.goto(origin + "/papers/demo-paper");
    await page
      .locator(".pb-text-layer")
      .getByText("FICTIONAL DEMONSTRATION MANUSCRIPT", { exact: false })
      .waitFor();
    await page.screenshot({
      path: "/tmp/paperbridge-hosted-reader.png",
      fullPage: true,
    });
    await page.goto(origin + "/review");
    await page
      .getByRole("heading", { name: "Think deeper. Revise with purpose." })
      .waitFor();
    await page.goto(origin + "/settings?tab=ai");
    await page
      .getByText("Bring your own intelligence", { exact: true })
      .waitFor();
    if (failures.length) throw Error(failures.join("; "));
    console.log(
      JSON.stringify({
        url: origin,
        status: response.status,
        securityHeaders: true,
        labeledPreview: true,
        pdfRendered: true,
        deepLinks: true,
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
