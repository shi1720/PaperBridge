/* Opt-in paid live OpenAI smoke through the real UI + local Firebase emulators.
   No Playwright tracing, screenshots, network logging, or persisted browser state. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const backendRequire = createRequire(
  path.resolve(__dirname, "../functions/package.json"),
);
const { chromium, expect } = require("@playwright/test");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.GCLOUD_PROJECT = "demo-paperbridge";
const { initializeApp } = backendRequire("firebase-admin/app");
const { getAuth } = backendRequire("firebase-admin/auth");
const { getFirestore } = backendRequire("firebase-admin/firestore");
initializeApp({
  projectId: "demo-paperbridge",
  storageBucket: "demo-paperbridge.appspot.com",
});
const db = getFirestore(),
  auth = getAuth();
const suffix = crypto.randomUUID();
const uid = "live-ai-" + suffix,
  paperId = "live-paper-" + suffix,
  email = uid + "@example.test",
  password = crypto.randomBytes(20).toString("base64url");
const title = "Fictional sleep pilot — live UI validation";
const manuscript =
  "We surveyed ten volunteers from one university. Participants self-reported sleep duration and completed a memory task once. We found a correlation of r=0.40. Our results prove that longer sleep causes better memory in all adults. No confidence interval was computed and no baseline covariates were measured. No intervention was randomized. Data and analysis code are not provided. This is a fictional manuscript solely for testing the review workflow.";
let key = "",
  browser,
  page,
  phase = "credentials",
  passed = false;
const start = Date.now();
const rateActions = ["profile.get", "notifications.list", "paper.list"];
function progress(step) {
  phase = step;
  console.log(JSON.stringify({ step }));
}
(async () => {
  try {
    key = process.env.OPENAI_API_KEY || "";
    if (!key && process.env.AI_TEST_OBJECTIVE) {
      const raw = fs
        .readFileSync(process.env.AI_TEST_OBJECTIVE, "utf8")
        .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
          String.fromCharCode(parseInt(n, 16)),
        )
        .replace(/\\_/g, "_");
      key = raw.match(/sk-proj-[A-Za-z0-9_-]+/)?.[0] || "";
    }
    if (!key) throw new Error("Missing authorized key source.");
    const base = process.env.AI_UI_URL || "http://localhost:5174";
    if (!/^http:\/\/(localhost|127\.0\.0\.1):5174$/.test(base))
      throw new Error("Local emulator UI only.");
    const config = await (await fetch(base + "/src/lib/firebase.ts")).text();
    assert.ok(
      config.includes('"VITE_USE_EMULATORS": "true"') &&
        config.includes('"VITE_FIREBASE_PROJECT_ID": "demo-paperbridge"'),
    );
    progress("create isolated verified emulator fixture");
    await auth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
      displayName: "Live AI Validation",
    });
    await db
      .doc("profiles/" + uid)
      .set({
        id: uid,
        name: "Live AI Validation",
        role: "researcher",
        headline: "Isolated test fixture",
        institution: "Independent researcher",
        bio: "",
        categories: ["cs.LG"],
        acceptingRequests: false,
        weeklyCapacity: 1,
        publicProfile: false,
        arxivUrl: "",
        orcid: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    await db.doc("users/" + uid).set({ email, emailVerified: true });
    await db
      .doc("papers/" + paperId)
      .set({
        id: paperId,
        ownerId: uid,
        title,
        abstract:
          "Fictional observational study with deliberate causal overstatement.",
        text: manuscript,
        category: "cs.LG",
        authors: "Test fixture",
        visibility: "private",
        storagePath: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    progress("sign in through UI");
    await page.goto(base + "/settings?tab=ai");
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    await dialog.getByLabel("Email address").fill(email);
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bring your own intelligence" }),
    ).toBeVisible();
    progress("save key through password field and verify encrypted storage");
    await page.getByLabel("API key", { exact: true }).fill(key);
    await page
      .getByRole("button", { name: "Validate and save encrypted key" })
      .click();
    await expect(
      page.getByText("OpenAI connected", { exact: false }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
    const stored = (await db.doc("aiKeys/" + uid + "_openai").get()).data();
    assert.ok(stored?.encrypted?.ciphertext);
    assert.equal(JSON.stringify(stored).includes(key), false);
    const clientStorage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    assert.equal(clientStorage.includes(key), false);
    progress("choose available model for all three perspectives");
    const model = process.env.AI_TEST_MODEL || "gpt-5.4-mini";
    for (const name of [
      "Evidence lens",
      "Attribution lens",
      "Critical reader",
    ]) {
      const select = page.getByLabel("Model for " + name, { exact: true });
      await expect(select.locator('option[value="' + model + '"]')).toHaveCount(
        1,
        { timeout: 60000 },
      );
      await select.selectOption(model);
    }
    progress("save chosen models");
    await page
      .getByRole("button", { name: "Save model choices", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText("Review models saved.", {
      timeout: 60000,
    });
    const settings = (await db.doc("aiSettings/" + uid).get()).data();
    for (const config of Object.values(settings.agents)) {
      assert.equal(config.model, model);
      assert.equal(config.provider, "openai");
    }
    progress("select private manuscript and grant per-run consent");
    await page.goto(base + "/review?paper=" + paperId);
    await expect(page.getByLabel("Manuscript", { exact: true })).toHaveValue(
      paperId,
    );
    const run = page.getByRole("button", {
      name: "Start a research review",
      exact: true,
    });
    await expect(run).toBeDisabled();
    await page.getByLabel(/I agree to send extracted manuscript text/).check();
    await expect(
      page.getByLabel(/Look up scholarly metadata/),
    ).not.toBeChecked();
    await expect(run).toBeEnabled();
    progress("run four live provider stages through callable Firebase API");
    await run.click();
    await expect(page.locator(".review-results")).toBeVisible({
      timeout: 450000,
    });
    const jobs = await db
      .collection("aiJobs")
      .where("ownerId", "==", uid)
      .get();
    assert.equal(jobs.size, 1);
    const job = jobs.docs[0].data();
    assert.equal(job.status, "completed");
    assert.equal(job.consent.metadataLookup, false);
    assert.equal(job.scope.truncated, false);
    assert.equal(job.scope.reviewedCharacters, manuscript.length);
    for (const stage of ["evidence", "originality", "reviewer", "synthesis"]) {
      assert.ok(job.results[stage]?.summary);
      assert.ok(Array.isArray(job.results[stage].findings));
      assert.equal(job.results[stage].provider, "openai");
      assert.ok(
        job.results[stage].findings.every((f) => manuscript.includes(f.quote)),
      );
    }
    console.log(
      JSON.stringify({
        providerExecutionCompleted: true,
        status: job.status,
        models: Object.fromEntries(
          Object.entries(job.results).map(([n, r]) => [n, r.model]),
        ),
        findingCounts: Object.fromEntries(
          Object.entries(job.results).map(([n, r]) => [n, r.findings.length]),
        ),
        limitations: Object.fromEntries(
          Object.entries(job.results).map(([n, r]) => [n, r.limitations]),
        ),
      }),
    );
    progress(
      "verify rendered synthesis, citations, model metadata and all stage tabs",
    );
    const results = page.locator(".review-results");
    await expect(
      results.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      results.locator(".tag").filter({ hasText: "completed" }),
    ).toBeVisible();
    await expect(
      results.getByText(job.results.synthesis.model, { exact: true }),
    ).toBeVisible();
    if (job.results.synthesis.findings.length)
      await expect(results.locator("blockquote").first()).toBeVisible();
    else
      await expect(
        results.getByText(/No accepted findings were returned/),
      ).toBeVisible();
    await expect(results.getByText(/Provider-reported usage:/)).toBeVisible();
    for (const [name, stage] of [
      ["Evidence lens", "evidence"],
      ["Attribution lens", "originality"],
      ["Critical reader", "reviewer"],
      ["Together, a clearer picture", "synthesis"],
    ]) {
      await results.getByRole("button", { name, exact: true }).click();
      await expect(results.locator(".review-summary")).not.toBeEmpty();
      if (job.results[stage].findings.length)
        await expect(results.locator("blockquote").first()).toBeVisible();
      else
        await expect(
          results.getByText(/No accepted findings were returned/),
        ).toBeVisible();
    }
    await results
      .getByText("Bibliographic lookup audit · 0 records", { exact: true })
      .click();
    await expect(
      results
        .locator("details")
        .getByText(/External metadata lookup was disabled/),
    ).toBeVisible();
    await expect(
      page.getByLabel(/I agree to send extracted manuscript text/),
    ).not.toBeChecked();
    progress("remove provider key through UI");
    await page.goto(base + "/settings?tab=ai");
    await page
      .getByRole("button", { name: "Remove openai key", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove openai key", exact: true }),
    ).toHaveCount(0);
    assert.equal(
      (await db.doc("aiKeys/" + uid + "_openai").get()).exists,
      false,
    );
    console.log(
      JSON.stringify({
        success: true,
        model,
        stages: Object.keys(job.results),
        findings: Object.fromEntries(
          Object.entries(job.results).map(([name, r]) => [
            name,
            r.findings.length,
          ]),
        ),
        usage: Object.fromEntries(
          Object.entries(job.results).map(([name, r]) => [name, r.usage]),
        ),
        summaries: Object.fromEntries(
          Object.entries(job.results).map(([name, r]) => [name, r.summary]),
        ),
        limitations: Object.fromEntries(
          Object.entries(job.results).map(([name, r]) => [name, r.limitations]),
        ),
        plaintextKeyPersisted: false,
      }),
    );
    passed = true;
  } catch (error) {
    // Never print Playwright errors: failed fill actions can include their argument.
    console.error(
      JSON.stringify({
        success: false,
        phase,
        errorType: error?.name || "Error",
        actual: ["string", "number", "boolean"].includes(typeof error?.actual)
          ? String(error.actual).slice(0, 60)
          : undefined,
        expected: ["string", "number", "boolean"].includes(
          typeof error?.expected,
        )
          ? String(error.expected).slice(0, 60)
          : undefined,
      }),
    );
    const audits = await db
      .collection("aiJobs")
      .where("ownerId", "==", uid)
      .get();
    for (const d of audits.docs) {
      const j = d.data();
      console.error(
        JSON.stringify({
          reviewStatus: j.status,
          errors: j.errors,
          stages: Object.keys(j.results || {}),
          findingCounts: Object.fromEntries(
            Object.entries(j.results || {}).map(([n, r]) => [
              n,
              r.findings?.length,
            ]),
          ),
          scope: j.scope,
        }),
      );
    }
    if (page) {
      const visibleErrors = await page
        .locator(".error-box")
        .allTextContents()
        .catch(() => []);
      console.error(
        JSON.stringify({
          visibleErrors: visibleErrors.map((t) =>
            key ? t.split(key).join("[redacted]") : t,
          ),
          selectedModels: await page
            .locator(".agent-config select")
            .evaluateAll((items) => items.map((e) => e.value))
            .catch(() => []),
          settingsSaved: (await db.doc("aiSettings/" + uid).get()).exists,
        }),
      );
    }
    if (phase.startsWith("verify rendered"))
      console.error(
        String(error.message || "")
          .split(key)
          .join("[redacted]")
          .split(password)
          .join("[redacted]")
          .slice(0, 1500),
      );
    process.exitCode = 1;
  } finally {
    progress("remove isolated emulator fixtures");
    await browser?.close();
    key = "";
    for (const collection of ["aiKeys", "aiJobs", "operationLeases"]) {
      const rows = await db
        .collection(collection)
        .where("ownerId", "==", uid)
        .get();
      await Promise.all(rows.docs.map((d) => d.ref.delete()));
    }
    for (const collection of [
      "profiles",
      "users",
      "aiSettings",
      "aiUsage",
      "deletionJobs",
    ])
      await db.doc(collection + "/" + uid).delete();
    await db.doc("papers/" + paperId).delete();
    for (
      let minute = Math.floor(start / 60000);
      minute <= Math.floor(Date.now() / 60000);
      minute++
    )
      for (const action of rateActions)
        await db
          .doc(
            "rateLimits/" +
              crypto
                .createHash("sha256")
                .update(`${uid}:${action}:${minute}`)
                .digest("hex"),
          )
          .delete();
    await auth.deleteUser(uid).catch((e) => {
      if (e.code !== "auth/user-not-found") throw e;
    });
    assert.equal(
      (await db.doc("aiKeys/" + uid + "_openai").get()).exists,
      false,
    );
    assert.equal((await db.doc("profiles/" + uid).get()).exists, false);
    console.log(JSON.stringify({ cleanupComplete: true, passed }));
    await db.terminate();
  }
})().catch(() => {
  console.error(
    "Smoke cleanup failed. Inspect emulator fixture records without logging credentials.",
  );
  process.exitCode = 1;
});
