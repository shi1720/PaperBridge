import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-paperbridge";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
if (!getApps().length) initializeApp({ projectId: "demo-paperbridge" });
function pdf() {
  const content =
    "BT /F1 18 Tf 60 740 Td (Sparse pathways for interpretable models) Tj 0 -40 Td /F1 12 Tf (We study sparse activation pathways using two synthetic benchmarks.) Tj 0 -25 Td (The reported effect is preliminary and requires external validation.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = out.length;
  out +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((x) => String(x).padStart(10, "0") + " 00000 n \n")
      .join("");
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(out);
}
async function register(
  page: any,
  name: string,
  email: string,
  endorser = false,
) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Join PaperBridge", exact: true })
    .click();
  if (endorser)
    await page.getByRole("button", { name: "I can help endorse" }).click();
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/Password/).fill("PaperBridge-test-2026!");
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const u = await getAuth().getUserByEmail(email);
  await getAuth().updateUser(u.uid, { emailVerified: true });
  await page.getByRole("button", { name: "refresh verification" }).click();
  await expect(page.locator(".verify-banner")).not.toBeVisible();
  return u.uid;
}
test("two researchers complete a private manuscript and endorsement conversation", async ({
  browser,
}) => {
  const authorContext = await browser.newContext(),
    reviewerContext = await browser.newContext();
  const author = await authorContext.newPage(),
    reviewer = await reviewerContext.newPage();
  const suffix = Date.now();
  const authorName = "UI Author " + suffix,
    reviewerName = "UI Reviewer " + suffix;
  await register(
    reviewer,
    reviewerName,
    `reviewer-${suffix}@example.test`,
    true,
  );
  await reviewer.getByRole("link", { name: "Settings & privacy" }).click();
  await reviewer
    .getByLabel("Research headline")
    .fill("Interpretable machine learning");
  await reviewer.getByLabel("Research categories").selectOption("cs.LG");
  await reviewer.getByLabel("I have checked my current arXiv").check();
  await reviewer.getByLabel("Accepting new requests").check();
  await reviewer.getByRole("button", { name: "Save your profile" }).click();
  await expect(reviewer.getByRole("status")).toContainText("profile is saved");
  await register(author, authorName, `author-${suffix}@example.test`);
  await author
    .getByRole("link", { name: "My manuscripts", exact: true })
    .click();
  await author
    .getByRole("button", { name: "Add manuscript", exact: true })
    .click();
  await author.getByLabel("Manuscript PDF").setInputFiles({
    name: "research.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await author
    .getByLabel("Paper title")
    .fill("Sparse pathways for interpretable models");
  await author
    .getByLabel("Abstract", { exact: true })
    .fill(
      "We investigate sparse activation pathways in compact language models. We compare two synthetic benchmarks and discuss limitations requiring external validation.",
    );
  await author.getByRole("button", { name: "Save manuscript" }).click();
  await expect(author).toHaveURL(/\/papers\//);
  await expect(author.getByRole("heading", { level: 1 })).toContainText(
    "Sparse pathways",
  );
  await expect(author.locator(".pb-pdf-page canvas").first()).toBeVisible();
  await author
    .getByRole("link", { name: "Find an endorser", exact: true })
    .click();
  await author.getByLabel("Search researchers").fill(reviewerName);
  await expect(author.locator(".person-card")).toHaveCount(1);
  await author.getByRole("button", { name: "Connect", exact: true }).click();
  await author
    .getByLabel("Your manuscript")
    .selectOption({ label: "Sparse pathways for interpretable models" });
  await author
    .getByLabel("A short introduction")
    .fill(
      "I am an independent researcher studying model interpretability. Could you review whether the evaluation supports the central claim?",
    );
  await author.getByLabel("I agree to share this manuscript").check();
  await author
    .getByRole("button", { name: "Send endorsement request" })
    .click();
  await expect(author).toHaveURL(/\/requests\//);
  const url = author.url();
  await expect(author.locator(".status-badge").first()).toContainText(
    "Awaiting reply",
  );
  await reviewer.goto(url);
  await reviewer
    .getByRole("button", { name: "Start reviewing", exact: true })
    .click();
  await reviewer.getByRole("button", { name: "Confirm update" }).click();
  await reviewer
    .getByLabel("Review comment")
    .fill("Please report a stronger baseline and an uncertainty interval.");
  await reviewer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    reviewer.getByText(
      "Please report a stronger baseline and an uncertainty interval.",
      { exact: true },
    ),
  ).toBeVisible();
  await author.reload();
  await author.getByRole("link", { name: "Read manuscript" }).click();
  await expect(author.locator(".pb-text-layer")).toContainText(
    "two synthetic benchmarks",
  );
  await author
    .getByLabel("Your note · page 1")
    .fill("Version one observation.");
  await author.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    author.getByText("Version one observation.", { exact: true }),
  ).toBeVisible();
  await author
    .getByRole("button", { name: "Upload revision", exact: true })
    .click();
  await author.getByLabel("Manuscript PDF").setInputFiles({
    name: "revision.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await author.getByRole("button", { name: "Save revised manuscript" }).click();
  await expect(author.getByRole("dialog")).not.toBeVisible();
  await expect(
    author.locator(".paper-detail-heading .tag").last(),
  ).toContainText("Version 2");
  await expect(
    author.getByText("Version one observation.", { exact: true }),
  ).not.toBeVisible();
  await author.getByLabel("Manuscript version").selectOption("1");
  await expect(
    author.getByText("Version one observation.", { exact: true }),
  ).toBeVisible();
  await author
    .getByLabel("Your note · page 1")
    .fill("Historical version is read only.");
  await expect(
    author.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  await author.goto(url);
  await expect(
    author.getByText(
      "Please report a stronger baseline and an uncertainty interval.",
      { exact: true },
    ),
  ).toBeVisible();
  await author
    .getByRole("button", { name: "Withdraw this request", exact: true })
    .click();
  await author.getByRole("button", { name: "Confirm update" }).click();
  await expect(author.locator(".status-badge").first()).toContainText(
    "Withdrawn",
  );
  await reviewer.reload();
  await reviewer.getByRole("link", { name: "Read manuscript" }).click();
  await expect(reviewer.getByRole("alert")).toContainText("not shared");
  await authorContext.close();
  await reviewerContext.close();
});
