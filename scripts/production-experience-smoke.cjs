/* Explicitly opt-in production verification using two temporary tenant accounts.
 * No provider keys, outbound emails, screenshots, traces, or persisted credentials.
 * Every mutation is restricted to freshly created fixture accounts and records.
 * Run only after deployment: node scripts/production-experience-smoke.cjs --run-live
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { client } = require("./cloud-admin.cjs");
const {
  getGlobalDefaultAccount,
  getAccessToken,
} = require("firebase-tools/lib/auth");
const { clientId, clientSecret } = require("firebase-tools/lib/api");
const backendRequire = createRequire(
  path.resolve(__dirname, "../functions/package.json"),
);
const { initializeApp, deleteApp } = backendRequire("firebase-admin/app");
const { getAuth } = backendRequire("firebase-admin/auth");
const { Firestore } = backendRequire("@google-cloud/firestore");
const { Storage } = backendRequire("@google-cloud/storage");
const projectId = "gen-lang-client-0444960702";
const databaseId = "paperbridge";
const tenantId = "PaperBridge-t4997";
const bucketName = "paperbridge-files-359201230061";
const origin = "https://paperbridge.web.app";
const endpoint = `https://us-central1-${projectId}.cloudfunctions.net`;
const runId = "pb-smoke-" + crypto.randomUUID();
const userIds = [runId + "-a", runId + "-b"];
const paperId = runId + "-paper";
const actions = new Set();
const startedAt = Date.now();
const createdUsers = new Set();
const tokens = new Map();
const knownChatIds = new Set();
let app,
  db,
  auth,
  bucket,
  phase = "preflight",
  passed = false;
const checked = [];
function check(name) {
  checked.push(name);
  console.log(JSON.stringify({ checked: name }));
}
function webConfig() {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../.env.local"),
    "utf8",
  );
  const value = (key) =>
    source
      .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, "") || "";
  assert.equal(
    value("VITE_FIREBASE_PROJECT_ID"),
    projectId,
    "Production web configuration must match the isolated backend.",
  );
  assert.equal(
    value("VITE_FIREBASE_AUTH_TENANT_ID"),
    tenantId,
    "Production tenant must match the isolated backend.",
  );
  const apiKey = value("VITE_FIREBASE_API_KEY");
  assert.ok(apiKey, "Missing Firebase public web API key.");
  return { apiKey };
}
async function call(uid, action, payload = {}) {
  assert.ok(
    createdUsers.has(uid),
    "Only this run's freshly created identities may call the app.",
  );
  actions.add(action);
  const response = await fetch(`${endpoint}/paperbridgeApi`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokens.get(uid)}`,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ data: { action, ...payload } }),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    const error = new Error("Controlled callable check failed.");
    error.code = result.error?.status || response.status;
    throw error;
  }
  return result.result?.data ?? result.data?.data;
}
function fixturePdf() {
  const content =
    "BT /F1 16 Tf 50 700 Td (PaperBridge temporary private smoke manuscript) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(value));
    value += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  value += offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("");
  value += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}
async function deleteFixtureQuery(collection, field, uid) {
  assert.ok(createdUsers.has(uid));
  const records = await db.collection(collection).where(field, "==", uid).get();
  for (const record of records.docs) await record.ref.delete();
}
async function cleanup() {
  if (!app) return;
  phase = "cleanup";
  const failures = [];
  const attempt = async (work) => {
    try {
      await work();
    } catch {
      failures.push(true);
    }
  };
  for (const uid of createdUsers) {
    // Hide the temporary fixture immediately, then remove only this run's paths.
    await attempt(() =>
      db
        .doc("profiles/" + uid)
        .set(
          { publicProfile: false, acceptingRequests: false },
          { merge: true },
        ),
    );
    await attempt(() =>
      bucket.deleteFiles({ prefix: `papers/${uid}/${paperId}/`, force: true }),
    );
    for (const [collection, field] of [
      ["notifications", "userId"],
      ["emailOutbox", "userId"],
      ["operationLeases", "ownerId"],
      ["chatMessages", "authorId"],
      ["follows", "followerId"],
      ["follows", "followingId"],
      ["blocks", "ownerId"],
      ["blocks", "targetId"],
    ])
      await attempt(() => deleteFixtureQuery(collection, field, uid));
    for (const collection of ["profiles", "users"])
      await attempt(() => db.doc(collection + "/" + uid).delete());
    for (
      let minute = Math.floor(startedAt / 60000);
      minute <= Math.floor(Date.now() / 60000);
      minute++
    )
      for (const action of actions) {
        const id = crypto
          .createHash("sha256")
          .update(`${uid}:${action}:${minute}`)
          .digest("hex");
        await attempt(() => db.doc("rateLimits/" + id).delete());
      }
    await attempt(async () => {
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    });
  }
  for (const id of knownChatIds)
    await attempt(() => db.doc("chats/" + id).delete());
  if (createdUsers.size)
    await attempt(() => db.doc("papers/" + paperId).delete());
  for (const uid of createdUsers) {
    await attempt(async () =>
      assert.equal((await db.doc("profiles/" + uid).get()).exists, false),
    );
    await attempt(async () =>
      assert.equal(
        (await db.collection("notifications").where("userId", "==", uid).get())
          .size,
        0,
      ),
    );
    await attempt(async () => {
      try {
        await auth.getUser(uid);
        throw new Error("Fixture account remains.");
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    });
    await attempt(async () =>
      assert.equal(
        (await bucket.getFiles({ prefix: `papers/${uid}/${paperId}/` }))[0]
          .length,
        0,
      ),
    );
  }
  tokens.clear();
  await attempt(() => db.terminate());
  await attempt(() => deleteApp(app));
  console.log(
    JSON.stringify({
      cleanupComplete: failures.length === 0,
      fixtureAccounts: createdUsers.size,
      passed,
      checks: checked,
    }),
  );
  if (failures.length) {
    process.exitCode = 1;
    console.error(
      "Controlled fixture cleanup needs operator attention. Inspect only this run's fixture prefix: " +
        runId,
    );
  }
}
(async () => {
  if (!process.argv.includes("--run-live")) {
    console.log(
      "Opt-in only. After deployment, pass --run-live to verify two temporary PaperBridge tenant accounts and clean them up.",
    );
    return;
  }
  try {
    assert.ok(
      !process.env.FIRESTORE_EMULATOR_HOST &&
        !process.env.FIREBASE_AUTH_EMULATOR_HOST &&
        !process.env.FIREBASE_STORAGE_EMULATOR_HOST &&
        !process.env.STORAGE_EMULATOR_HOST,
      "Do not mix production verification with emulator routing.",
    );
    const { apiKey } = webConfig();
    // Reuse the existing CLI login in memory; never create/download a service-account key.
    await client("https://identitytoolkit.googleapis.com");
    const account = getGlobalDefaultAccount();
    assert.ok(
      account?.tokens?.refresh_token,
      "Existing Firebase CLI login required.",
    );
    app = initializeApp(
      {
        projectId,
        storageBucket: bucketName,
        credential: {
          async getAccessToken() {
            const result = await getAccessToken(account.tokens.refresh_token, [
              "https://www.googleapis.com/auth/cloud-platform",
            ]);
            return {
              access_token: result.access_token,
              expires_in: Math.max(
                60,
                Math.floor(
                  ((result.expires_at || Date.now() + 3600000) - Date.now()) /
                    1000,
                ),
              ),
            };
          },
        },
      },
      runId,
    );
    // The Admin Auth credential supports CLI token refresh.
    // Firestore/Storage Admin wrappers only accept certificate/ADC credentials,
    // so their native clients receive the existing user credential in memory.
    const cloudCredentials = {
      type: "authorized_user",
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: account.tokens.refresh_token,
    };
    db = new Firestore({
      projectId,
      databaseId,
      credentials: cloudCredentials,
    });
    auth = getAuth(app).tenantManager().authForTenant(tenantId);
    bucket = new Storage({ projectId, credentials: cloudCredentials }).bucket(
      bucketName,
    );
    phase = "create controlled identities";
    for (const [index, uid] of userIds.entries()) {
      const email = `${uid}@example.invalid`;
      const password = crypto.randomBytes(32).toString("base64url");
      await auth.createUser({
        uid,
        email,
        password,
        emailVerified: true,
        displayName: `Temporary PaperBridge validation ${index + 1}`,
      });
      createdUsers.add(uid);
      phase = "sign in controlled tenant fixture";
      const signed = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
            tenantId,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const session = await signed.json();
      assert.ok(
        signed.ok && session.idToken,
        "Controlled tenant sign-in failed.",
      );
      tokens.set(uid, session.idToken);
      await call(uid, "profile.save", {
        profile: {
          name: `Temporary PaperBridge validation ${index + 1}`,
          role: "researcher",
          headline: "Automated release check — removed immediately",
          institution: "PaperBridge validation",
          bio: "Temporary controlled fixture. No real researcher or research claim.",
          categories: ["cs.LG"],
          acceptingRequests: false,
          weeklyCapacity: 1,
          publicProfile: true,
        },
      });
    }
    const [a, b] = userIds;
    check("two isolated verified tenant accounts");
    phase = "follow and notification ownership";
    assert.equal((await call(a, "follow.toggle", { id: b })).following, true);
    const notice = (await call(b, "notifications.list")).find(
      (n) => n.title === "New follower",
    );
    assert.equal(notice.link, `/researchers/${a}`);
    await assert.rejects(
      call(a, "notifications.read", { id: notice.id }),
      (error) => error.code === "NOT_FOUND",
    );
    assert.equal(
      (await call(b, "notifications.read", { id: notice.id })).updated,
      1,
    );
    check("follow alert and per-item notification ownership");
    phase = "conversation unread cutoffs";
    // Record the deterministic path before the request, including the case where
    // the server creates it but the response is lost or times out.
    const expectedChatId = crypto
      .createHash("sha256")
      .update([a, b].sort().join(":"))
      .digest("hex");
    knownChatIds.add(expectedChatId);
    const chat = await call(a, "chat.open", { userId: b });
    assert.equal(chat.id, expectedChatId);
    knownChatIds.add(chat.id);
    const first = await call(a, "chat.send", {
      id: chat.id,
      body: "Controlled first message; temporary release fixture.",
    });
    const second = await call(a, "chat.send", {
      id: chat.id,
      body: "Controlled second message; temporary release fixture.",
    });
    assert.equal(
      (await call(b, "chat.list")).find((item) => item.id === chat.id)
        .unreadCount,
      2,
    );
    assert.equal(
      (await call(b, "chat.read", { id: chat.id, through: first.createdAt }))
        .unreadCount,
      1,
    );
    const notices = (await call(b, "notifications.list")).filter(
      (n) => n.link === `/messages?chat=${chat.id}`,
    );
    assert.equal(
      notices.find((n) => n.createdAt === second.createdAt).read,
      false,
    );
    assert.equal(
      (await call(b, "chat.read", { id: chat.id, through: second.createdAt }))
        .unreadCount,
      0,
    );
    check("chat unread counts and message-notification read cutoff");
    phase = "private manuscript upload and access";
    actions.add("paper.upload");
    const pdf = fixturePdf();
    const upload = await fetch(
      `${endpoint}/paperbridgeUploadManuscript?paperId=${paperId}&fileName=temporary-validation.pdf`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokens.get(a)}`,
          "content-type": "application/pdf",
          origin,
        },
        body: pdf,
        signal: AbortSignal.timeout(60000),
      },
    );
    const uploaded = await upload.json();
    assert.ok(
      upload.ok && uploaded.data?.storagePath,
      "Controlled PDF upload failed.",
    );
    await call(a, "paper.save", {
      paper: {
        id: paperId,
        title: "Temporary private release validation",
        abstract:
          "Fictional temporary manuscript for verifying upload privacy. No scientific claim.",
        authors: "PaperBridge automated validation",
        category: "cs.LG",
        visibility: "private",
        storagePath: uploaded.data.storagePath,
        fileName: uploaded.data.fileName,
        text: "Fictional temporary content with no research claim.",
      },
    });
    const paper = await call(a, "paper.get", { id: paperId });
    assert.ok(
      paper.downloadUrl,
      "Owner must receive a short-lived download URL.",
    );
    const downloaded = await fetch(paper.downloadUrl, {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(downloaded.status, 200);
    assert.equal(Buffer.from(await downloaded.arrayBuffer()).equals(pdf), true);
    await assert.rejects(
      call(b, "paper.get", { id: paperId }),
      (error) => error.code === "PERMISSION_DENIED",
    );
    check("private PDF upload, signed download and cross-account denial");
    phase = "block and email isolation";
    await call(b, "block.toggle", { userId: a });
    await assert.rejects(
      call(a, "chat.send", {
        id: chat.id,
        body: "This blocked message must not be saved.",
      }),
      (error) => error.code === "PERMISSION_DENIED",
    );
    for (const uid of userIds)
      assert.equal(
        (await db.collection("emailOutbox").where("userId", "==", uid).get())
          .size,
        0,
        "Smoke must not enqueue any email.",
      );
    check("blocked messages denied and zero outbound email jobs");
    passed = true;
  } catch (error) {
    process.exitCode = 1;
    console.error(
      JSON.stringify({
        passed: false,
        phase,
        code:
          typeof error.code === "string"
            ? error.code.replace(/[^A-Za-z0-9_/-]/g, "").slice(0, 80)
            : error.code || "check-failed",
      }),
    );
  } finally {
    await cleanup();
  }
})().catch(() => {
  console.error(
    "Production smoke stopped safely; inspect controlled fixture cleanup without logging tokens.",
  );
  process.exitCode = 1;
});
