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

test.beforeEach(async ({ context }) => {
  // The emulator's optional Material theme/fonts must not make local auth depend
  // on third-party CDNs. Its actual provider form and token exchange still run.
  await context.route(
    /^https:\/\/(unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
});

async function googlePopup(page: Page) {
  const pending = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  const popup = await pending;
  await expect(popup.locator("#title")).toContainText("Google.com");
  return popup;
}

test("Google creates the chosen role and returning sign-in preserves the workspace", async ({
  page,
}) => {
  const email = `google-${Date.now()}@example.test`;
  await page.goto("http://127.0.0.1:5174/");
  await page
    .getByRole("button", { name: "Join as an endorser", exact: true })
    .click();
  const googleButton = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  });
  await expect(googleButton).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create your account", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "I’m a researcher" }),
  ).toHaveAttribute("aria-pressed", "false");
  const endorser = page.getByRole("button", { name: "I can help endorse" });
  await expect(endorser).toHaveAttribute("aria-pressed", "false");
  await endorser.click();
  await expect(endorser).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Selected: Researcher & endorser/)).toBeVisible();
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
  await page.goto("http://127.0.0.1:5174/");
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

test("first Google login requires an explicit role after OAuth, including after reload", async ({
  page,
}) => {
  const email = `google-onboarding-${Date.now()}@example.test`;
  await page.goto("http://127.0.0.1:5174/");
  await page
    .getByRole("button", { name: "Create your research profile", exact: true })
    .click();
  await page.getByRole("button", { name: "I can help endorse" }).click();
  // A previously selected signup role must not silently carry into Sign in.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const popup = await googlePopup(page);
  await popup.getByRole("button", { name: "Add new account" }).click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill("New Google Researcher");
  await popup.locator("#sign-in").click();
  const onboarding = page.getByRole("dialog", {
    name: "Let’s finish your research profile",
  });
  await expect(onboarding).toBeVisible();
  const user = await getAuth().getUserByEmail(email);
  const profile = getFirestore().doc(`profiles/${user.uid}`);
  expect((await profile.get()).exists).toBe(false);
  await expect(onboarding.getByLabel("Your role · required")).toHaveValue("");
  await expect(
    onboarding.getByRole("button", { name: "Complete profile", exact: true }),
  ).toBeDisabled();
  await expect(onboarding.getByLabel("Full name", { exact: true })).toHaveValue(
    "New Google Researcher",
  );
  await page.reload();
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByLabel("Your role · required")).toHaveValue("");
  expect((await profile.get()).exists).toBe(false);
  await onboarding
    .getByLabel("Your role · required")
    .selectOption("researcher");
  await onboarding
    .getByRole("button", { name: "Complete profile", exact: true })
    .click();
  await expect(page.locator(".account strong")).toHaveText(
    "New Google Researcher",
  );
  expect((await profile.get()).data()).toMatchObject({
    name: "New Google Researcher",
    role: "researcher",
    institution: "",
  });
});
