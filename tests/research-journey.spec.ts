import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-paperbridge";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
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
    .getByRole("button", { name: "Create your research profile", exact: true })
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
  await expect
    .poll(async () => {
      const jobs = await getFirestore()
        .collection("emailOutbox")
        .where("userId", "==", u.uid)
        .get();
      return jobs.docs.filter(
        (doc: any) => doc.data().kind === "auth-verification",
      ).length;
    })
    .toBe(1);
  const jobs = await getFirestore()
    .collection("emailOutbox")
    .where("userId", "==", u.uid)
    .get();
  const verification = jobs.docs
    .find((doc: any) => doc.data().kind === "auth-verification")!
    .data();
  expect(verification.to).toBe(email);
  expect(verification.subject).toBe("Verify your email for PaperBridge");
  expect(verification.body).toContain("oobCode=");
  expect(verification.status).not.toBe("sent");
  // An immediate resend displays the real cooldown and cannot create duplicate mail.
  await page.getByRole("button", { name: "Resend email", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /wait|minute|try again/i }),
  ).toBeVisible();
  expect(
    (
      await getFirestore()
        .collection("emailOutbox")
        .where("userId", "==", u.uid)
        .get()
    ).docs.filter((doc: any) => doc.data().kind === "auth-verification"),
  ).toHaveLength(1);
  const link = new URL(verification.body.match(/https?:\/\/[^\s]+/)![0]);
  const oobCode = link.searchParams.get("oobCode");
  expect(Boolean(oobCode)).toBe(true);
  // Consume the generated link through Auth's emulator API, without exposing the code in browser traces.
  const verified = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=emulator-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oobCode }),
    },
  );
  expect(verified.status).toBe(200);
  expect((await getAuth().getUser(u.uid)).emailVerified).toBe(true);
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
  await author
    .getByRole("button", { name: "Request review", exact: true })
    .click();
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
  // Wait for the status mutation and its refreshed view before editing the
  // conversation behind the modal. A fast fill can otherwise target the old DOM.
  await expect(reviewer.getByRole("dialog")).not.toBeVisible();
  await expect(reviewer.locator(".status-badge").first()).toContainText(
    "In review",
  );
  await reviewer
    .getByLabel("Review comment")
    .fill("Please report a stronger baseline and an uncertainty interval.");
  // Hold the successful response so edits cannot be lost while the comment
  // submission is in flight. Other callable requests continue normally.
  let releaseCommentResponse!: () => void;
  const commentResponseGate = new Promise<void>((resolve) => {
    releaseCommentResponse = resolve;
  });
  await reviewer.route("**/paperbridgeApi", async (route) => {
    if (route.request().postDataJSON()?.data?.action !== "request.comment") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await commentResponseGate;
    await route.fulfill({ response });
  });
  try {
    await reviewer.getByRole("button", { name: "Send", exact: true }).click();
    await expect(reviewer.getByLabel("Review comment")).toBeDisabled();
    await expect(reviewer.getByLabel("Review comment")).toHaveValue(
      "Please report a stronger baseline and an uncertainty interval.",
    );
  } finally {
    releaseCommentResponse();
  }
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
  await author.getByLabel("Visibility", { exact: true }).selectOption("shared");
  await author
    .getByLabel("Your note · page 1")
    .fill("Please clarify the scope of the benchmark claim.");
  await author.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    author.getByText("Please clarify the scope of the benchmark claim.", {
      exact: true,
    }),
  ).toBeVisible();
  await reviewer.goto(url + "?tab=manuscript");
  await expect(
    reviewer.getByText("Version one observation.", { exact: true }),
  ).not.toBeVisible();
  const sharedNote = reviewer
    .locator(".pb-note")
    .filter({ hasText: "Please clarify the scope of the benchmark claim." });
  await expect(sharedNote).toBeVisible();
  await sharedNote.getByRole("button", { name: "Reply", exact: true }).click();
  await sharedNote
    .getByLabel("Reply to note on page 1")
    .fill("Agreed. Limit this to the two evaluated benchmarks.");
  await sharedNote
    .getByRole("button", { name: "Send reply", exact: true })
    .click();
  await expect(sharedNote).toContainText(
    "Agreed. Limit this to the two evaluated benchmarks.",
  );
  await author.reload();
  const authorNote = author
    .locator(".pb-note")
    .filter({ hasText: "Please clarify the scope of the benchmark claim." });
  await authorNote
    .getByRole("button", { name: "1 reply", exact: true })
    .click();
  await expect(authorNote).toContainText(
    "Agreed. Limit this to the two evaluated benchmarks.",
  );
  await authorNote
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await expect(authorNote).toContainText("Resolved");
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
  await expect(author.getByLabel("Your note · page 1")).toBeDisabled();
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
  await expect(reviewer).toHaveURL(/tab=manuscript/);
  await expect(reviewer.getByRole("alert")).toContainText("not shared");
  await authorContext.close();
  await reviewerContext.close();
});

test("signed-out password recovery sends a branded link that changes only the intended account password", async ({
  page,
}) => {
  const email = `recovery-${Date.now()}@example.test`;
  const user = await getAuth().createUser({
    email,
    password: "Old-test-password-2026!",
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await page.getByLabel("Email address").fill(email);
    await page
      .getByRole("button", { name: "Send reset link", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "If an account exists" }),
    ).toBeVisible();
    const jobs = await getFirestore()
      .collection("emailOutbox")
      .where("userId", "==", user.uid)
      .get();
    expect(jobs.size).toBe(1);
    const job = jobs.docs[0].data();
    expect(job.kind).toBe("auth-password-reset");
    expect(job.presentation.actionLabel).toBe("Reset password");
    const code = new URL(job.presentation.actionUrl).searchParams.get(
      "oobCode",
    );
    expect(Boolean(code)).toBe(true);
    const newPassword = "New-test-password-2026!";
    const reset = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator-key",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oobCode: code, newPassword }),
      },
    );
    expect(reset.status).toBe(200);
    const login = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: newPassword,
          returnSecureToken: true,
        }),
      },
    );
    expect(login.status).toBe(200);
    expect((await login.json()).localId).toBe(user.uid);
  } finally {
    await getAuth().deleteUser(user.uid);
    const jobs = await getFirestore()
      .collection("emailOutbox")
      .where("userId", "==", user.uid)
      .get();
    for (const job of jobs.docs) await job.ref.delete();
  }
});

test("researcher social journey connects public profiles, follows, discussions, notifications and private messages", async ({
  browser,
}) => {
  const aContext = await browser.newContext(),
    bContext = await browser.newContext();
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  const stamp = Date.now();
  const nameA = "Social Author " + stamp,
    nameB = "Social Reader " + stamp;
  try {
    const idA = await register(a, nameA, `social-author-${stamp}@example.test`);
    await register(b, nameB, `social-reader-${stamp}@example.test`);
    await a.goto("/community");
    const body = "How should we report variation across random seeds? " + stamp;
    await a.getByLabel("Your community post").fill(body);
    await a.getByRole("button", { name: "Publish post", exact: true }).click();
    await expect(
      a.locator(".social-post").filter({ hasText: body }),
    ).toBeVisible();
    await b.goto("/researchers");
    await b.getByLabel("Search community researchers").fill(nameA);
    await b.getByRole("link", { name: nameA, exact: true }).click();
    await expect(
      b.getByRole("heading", { name: nameA, exact: true }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Follow researcher", exact: true })
      .click();
    await expect(
      b.getByRole("button", { name: "Following", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await b.goto("/community");
    const post = b.locator(".social-post").filter({ hasText: body });
    await expect(post).toBeVisible();
    // Both the post action and feed filter say Following once data has loaded.
    await expect(
      post.getByRole("button", { name: "Following", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await b
      .getByRole("group", { name: "Feed filter", exact: true })
      .getByRole("button", { name: /^Following/ })
      .click();
    await expect(post).toBeVisible();
    await expect(
      post.getByRole("link", { name: nameA, exact: true }),
    ).toHaveAttribute("href", "/researchers/" + idA);
    await post.getByRole("button", { name: /Like/ }).click();
    await expect(post.getByRole("button", { name: /Like/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await post.getByRole("button", { name: /Discuss/ }).click();
    await post
      .getByLabel("Add a thoughtful reply")
      .fill("Report the mean and standard deviation across all runs.");
    await post.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(
      post.getByText(
        "Report the mean and standard deviation across all runs.",
        { exact: true },
      ),
    ).toBeVisible();
    await a.reload();
    await a.getByRole("button", { name: "Notifications", exact: true }).click();
    await a
      .getByRole("dialog")
      .getByRole("link", { name: "Open update", exact: true })
      .first()
      .click();
    await expect(a).toHaveURL(/\/community#post-/);
    await expect(a.locator(".social-post")).toContainText(body);
    await b.goto("/messages");
    await b
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await b.getByLabel("Find a researcher", { exact: true }).fill(nameA);
    await b.getByRole("dialog").getByRole("combobox").selectOption(idA);
    await b
      .getByRole("button", { name: "Open conversation", exact: true })
      .click();
    await expect(b.getByRole("dialog")).not.toBeVisible();
    await b
      .getByLabel("Your message", { exact: true })
      .fill("Would you like to compare evaluation protocols?");
    await b.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(b.getByLabel("Conversation messages")).toContainText(
      "Would you like to compare evaluation protocols?",
    );
    await a.reload();
    await a.getByRole("button", { name: "Notifications", exact: true }).click();
    await a
      .getByRole("dialog")
      .getByRole("link", { name: "Open update", exact: true })
      .first()
      .click();
    await expect(a).toHaveURL(/\/messages\?chat=/);
    await expect(a.getByLabel("Conversation messages")).toContainText(
      "Would you like to compare evaluation protocols?",
    );
    await getFirestore()
      .doc("profiles/" + idA)
      .update({ publicProfile: false });
    await b.goto("/researchers/" + idA);
    await expect(b.getByRole("alert")).toContainText("private");
  } finally {
    await aContext.close();
    await bContext.close();
  }
});
