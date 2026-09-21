import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
if (!getApps().length) initializeApp({ projectId: "demo-paperbridge" });

async function googlePopup(page: Page) {
  const pending = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  return pending;
}

test("Google creates the chosen role and returning sign-in preserves the workspace", async ({
  page,
}) => {
  const email = `google-${Date.now()}@example.test`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Join as an endorser", exact: true })
    .click();
  const popup = await googlePopup(page);
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill("Google Researcher");
  await popup.locator("#sign-in").click();
  await expect(page.locator(".account strong")).toHaveText("Google Researcher");
  const user = await getAuth().getUserByEmail(email);
  expect(user.emailVerified).toBe(true);
  expect(
    user.providerData.some(
      (provider: any) => provider.providerId === "google.com",
    ),
  ).toBe(true);
  const profile = getFirestore().doc(`profiles/${user.uid}`);
  expect((await profile.get()).data().role).toBe("endorser");
  await expect(page.locator(".verify-banner")).toHaveCount(0);
  await profile.update({
    name: "Preserved Researcher",
    headline: "Existing research",
    categories: ["cs.LG"],
    publicProfile: false,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const returning = await googlePopup(page);
  await returning.getByText(email, { exact: true }).click();
  await expect(page.locator(".account strong")).toHaveText(
    "Preserved Researcher",
  );
  expect((await profile.get()).data()).toMatchObject({
    role: "endorser",
    headline: "Existing research",
    categories: ["cs.LG"],
    publicProfile: false,
  });
  expect((await getAuth().getUserByEmail(email)).uid).toBe(user.uid);
});

test("cancelling Google sign-in leaves email sign-in available", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const popup = await googlePopup(page);
  await popup.close();
  await expect(
    page.getByText(
      "Google sign-in was cancelled. You can try again when you’re ready.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Email address")).toBeEditable();
});
