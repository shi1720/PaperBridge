import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-paperbridge";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const sharp = require("sharp");
if (!getApps().length) initializeApp({ projectId: "demo-paperbridge" });
const api = "http://127.0.0.1:5001/demo-paperbridge/us-central1/paperbridgeApi";
async function call(token: string, action: string, payload: any = {}) {
  const response = await fetch(api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ data: { action, ...payload } }),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(`${action}: ${result.error?.message}`);
  return result.result.data;
}
async function fixture(role: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `media-${role}-${stamp}@example.test`,
    password = "PaperBridge-media-test-2026!";
  const user = await getAuth().createUser({
    email,
    password,
    emailVerified: true,
  });
  const signed = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const { idToken } = await signed.json();
  const name = `Media ${role} ${stamp}`;
  await call(idToken, "profile.save", {
    profile: {
      name,
      role: "researcher",
      publicProfile: true,
      headline: "Reproducible evaluation",
      bio: "",
      categories: ["cs.LG"],
      acceptingRequests: false,
      weeklyCapacity: 2,
    },
  });
  return { email, password, token: idToken, uid: user.uid, name };
}
async function login(page: Page, person: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(person.email);
  await page.getByLabel("Password", { exact: true }).fill(person.password);
  await page
    .getByRole("dialog")
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("researchers share images and PDFs, save a discussion, edit posts, and keep profile edits during a photo save", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const a = await fixture("author"),
    b = await fixture("reader");
  const authorContext = await browser.newContext(),
    readerContext = await browser.newContext();
  const author = await authorContext.newPage(),
    reader = await readerContext.newPage();
  const errors: string[] = [];
  author.on("pageerror", (e) => errors.push(e.message));
  reader.on("pageerror", (e) => errors.push(e.message));
  try {
    await login(author, a);
    await login(reader, b);
    const png = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#466d4b" },
    })
      .png()
      .toBuffer();
    await author.goto("/settings");
    await author
      .getByLabel("Research headline")
      .fill("An unfinished headline that should survive a photo save");
    await author.getByLabel("Profile photo", { exact: true }).setInputFiles({
      name: "researcher.png",
      mimeType: "image/png",
      buffer: png,
    });
    await author
      .getByRole("button", { name: "Save photo", exact: true })
      .click();
    await expect(author.getByRole("status")).toContainText(
      "Profile photo updated",
    );
    await expect(author.getByLabel("Research headline")).toHaveValue(
      "An unfinished headline that should survive a photo save",
    );
    await author
      .getByRole("button", { name: "Save your profile", exact: true })
      .click();
    await expect(author.getByRole("status")).toContainText("profile is saved");
    await reader.goto("/researchers/" + a.uid);
    const avatar = reader.locator(".researcher-profile-identity .avatar img");
    await expect(avatar).toBeVisible();
    await expect
      .poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await author.goto("/community");
    await author
      .getByRole("button", { name: "Ask a question", exact: true })
      .click();
    const body = `What makes an evaluation figure useful? ${a.uid}`;
    await author.getByLabel("Your community post").fill(body);
    await author.getByLabel("Attach images or PDFs").setInputFiles([
      { name: "evaluation-figure.png", mimeType: "image/png", buffer: png },
      {
        name: "evaluation-notes.pdf",
        mimeType: "application/pdf",
        buffer: await readFile("public/demo-manuscript.pdf"),
      },
    ]);
    await expect(author.locator(".media-draft")).toHaveCount(2);
    await author
      .getByRole("button", { name: "Publish post", exact: true })
      .click();
    const ownPost = author.locator(".social-post").filter({ hasText: body });
    await expect(ownPost).toBeVisible();
    await expect(ownPost.locator(".post-image img")).toBeVisible();
    let renewals = 0;
    await reader.route("**/paperbridgeApi", async (route) => {
      const action = route.request().postDataJSON()?.data?.action;
      if (action === "media.get") renewals++;
      if (action !== "feed.list") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const json = await response.json();
      for (const entry of json.result?.data || []) {
        if (entry.body !== body) continue;
        for (const asset of entry.attachments || [])
          if (asset.kind === "image")
            asset.url = "http://localhost:5174/expired-thumbnail.png";
      }
      await route.fulfill({ response, json });
    });
    await reader.goto("/community");
    const post = reader.locator(".social-post").filter({ hasText: body });
    await expect(post).toBeVisible();
    await expect
      .poll(() =>
        post
          .locator(".post-image img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(renewals).toBeGreaterThan(0);
    await reader.unroute("**/paperbridgeApi");
    await post.getByRole("button", { name: "Save post", exact: true }).click();
    await expect(
      post.getByRole("button", { name: "Unsave post", exact: true }),
    ).toBeVisible();
    await post.getByRole("button", { name: /evaluation-notes.pdf/ }).click();
    await expect(reader.locator(".community-pdf canvas")).toBeVisible();
    await expect(
      reader.getByText("Loading PDF…", { exact: true }),
    ).not.toBeVisible();
    await expect(reader.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    await reader
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await reader.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(post).toBeVisible();
    await reader.getByLabel("Filter post type").selectOption("question");
    await expect(post).toBeVisible();
    await ownPost
      .getByRole("button", { name: "Edit post", exact: true })
      .click();
    await author
      .getByRole("dialog")
      .getByLabel("Your post", { exact: true })
      .fill(body + " Updated with context.");
    await author
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(author.getByRole("dialog")).not.toBeVisible();
    await reader.reload();
    await expect(post).toContainText("Updated with context.");
    await reader.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        reader.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page: reader })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      accessibility.violations
        .filter((v) => ["serious", "critical"].includes(v.impact || ""))
        .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await reader.screenshot({
      path: "test-results/community-revamp-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await authorContext.close();
    await readerContext.close();
    await call(a.token, "account.delete");
    await call(b.token, "account.delete");
  }
});

test("returning user waits for profile restoration before adding a manuscript", async ({
  browser,
}) => {
  const person = await fixture("returning-author");
  const context = await browser.newContext();
  const page = await context.newPage();
  let releaseProfile!: () => void;
  const heldProfile = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  try {
    await login(page, person);
    await expect(page.locator(".account strong")).toHaveText(person.name);
    await page.goto("/papers");
    await expect(
      page.getByRole("button", { name: "Add manuscript", exact: true }),
    ).toBeVisible();
    await page.route("**/paperbridgeApi", async (route) => {
      if (route.request().postDataJSON()?.data?.action === "profile.get")
        await heldProfile;
      await route.continue();
    });
    const restoring = page.waitForRequest(
      (request) =>
        request.url().endsWith("/paperbridgeApi") &&
        request.postDataJSON()?.data?.action === "profile.get",
    );
    await page.reload();
    await restoring;
    // Finish loading the route code before inspecting the held-auth state. This
    // prevents Suspense's temporary fallback from masking the original race.
    await page.evaluate(async () => {
      await import("/src/components/Papers.tsx");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await expect(page.locator("main .loading")).toHaveText(
      "Loading your workspace…",
    );
    await expect(
      page.getByRole("button", { name: "Add manuscript", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    releaseProfile();
    await page
      .getByRole("button", { name: "Add manuscript", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Manuscript PDF")).toBeVisible();
    await expect(dialog.getByLabel("Email address")).toHaveCount(0);
  } finally {
    releaseProfile();
    await context.close();
    await call(person.token, "account.delete");
  }
});
