import { aiJobListItem } from "./dto";
import { rateLimit } from "./rate-limit";
import { getDb } from "./runtime";
import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import {
  AGENTS,
  AgentConfig,
  LIMITS,
  PROMPTS,
  Provider,
  ProviderError,
  collectMetadata,
  decryptKey,
  discoverModels,
  encryptKey,
  generate,
  manuscriptExcerpt,
  parseReview,
  provider,
  normalizeConfig,
  pdfDiagnostics,
  runBounded,
} from "./ai-core";
export const aiEncryptionKey = defineSecret(
  "PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY",
);
const db = () => getDb();
const keyRef = (uid: string, p: Provider) =>
  db().collection("aiKeys").doc(`${uid}_${p}`);
function id(v: unknown) {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(v))
    throw new HttpsError("invalid-argument", "Invalid identifier.");
  return v;
}
async function readKey(uid: string, p: Provider) {
  const doc = await keyRef(uid, p).get();
  if (!doc.exists)
    throw new HttpsError(
      "failed-precondition",
      `Add your ${p} API key in settings.`,
    );
  try {
    return decryptKey(
      doc.data()!.encrypted,
      aiEncryptionKey.value(),
      `${uid}:${p}`,
    );
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "Your key could not be decrypted. Contact the administrator or save it again.",
    );
  }
}
async function settings(uid: string) {
  const [config, keys] = await Promise.all([
    db().collection("aiSettings").doc(uid).get(),
    Promise.all(
      (["openai", "anthropic", "gemini"] as Provider[]).map((p) =>
        keyRef(uid, p).get(),
      ),
    ),
  ]);
  return {
    agents: config.data()?.agents || {},
    keys: keys
      .filter((k) => k.exists)
      .map((k) => ({
        provider: k.data()!.provider,
        updatedAt: k.data()!.updatedAt,
      })),
    limits: LIMITS,
  };
}
export async function handleAI(
  action: string,
  data: any,
  uid: string,
): Promise<any> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  await rateLimit(uid, action);
  try {
    if (action === "ai.settings") return settings(uid);
    if (action === "ai.key.save") {
      const p = provider(data.provider),
        key = typeof data.key === "string" ? data.key.trim() : "";
      if (key.length < 20 || key.length > 512 || /\s/.test(key))
        throw new HttpsError("invalid-argument", "Enter a valid API key.");
      // Validate before persisting. Never return even a partial key to the client.
      const models = await discoverModels(p, key);
      let encrypted;
      try {
        encrypted = encryptKey(key, aiEncryptionKey.value(), `${uid}:${p}`);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "AI encryption is not configured by the administrator.",
        );
      }
      await keyRef(uid, p).set({
        ownerId: uid,
        provider: p,
        encrypted,
        updatedAt: Date.now(),
      });
      return { provider: p, connected: true, models };
    }
    if (action === "ai.key.delete") {
      await keyRef(uid, provider(data.provider)).delete();
      return { deleted: true };
    }
    if (action === "ai.models") {
      const p = provider(data.provider);
      return {
        models: await discoverModels(p, await readKey(uid, p)),
        fetchedAt: Date.now(),
      };
    }
    if (action === "ai.configure") {
      const agents: Partial<Record<string, AgentConfig>> = {};
      const catalogs = new Map<Provider, Set<string>>();
      for (const name of AGENTS) {
        const c = data.agents?.[name];
        if (!c)
          throw new HttpsError(
            "invalid-argument",
            "Configure all five review specialists.",
          );
        const p = provider(c.provider);
        if (!catalogs.has(p))
          catalogs.set(
            p,
            new Set(
              (await discoverModels(p, await readKey(uid, p))).map((m) => m.id),
            ),
          );
        if (!catalogs.get(p)!.has(c.model))
          throw new HttpsError(
            "invalid-argument",
            "Select a model available to your API key.",
          );
        agents[name] = normalizeConfig({
          provider: p,
          model: c.model,
          reasoningEffort: c.reasoningEffort,
        });
      }
      await db()
        .collection("aiSettings")
        .doc(uid)
        .set({ ownerId: uid, agents, updatedAt: Date.now() });
      return settings(uid);
    }
    if (action === "ai.jobs") {
      let query = db().collection("aiJobs").where("ownerId", "==", uid);
      if (data.paperId) query = query.where("paperId", "==", id(data.paperId));
      const rows = await query
        .orderBy("createdAt", "desc")
        .limit(100)
        .select(
          "ownerId",
          "paperId",
          "title",
          "status",
          "createdAt",
          "updatedAt",
        )
        .get();
      return rows.docs.map((d) => aiJobListItem(d.id, d.data()));
    }
    if (action === "ai.job.get") {
      const doc = await db().collection("aiJobs").doc(id(data.id)).get();
      if (!doc.exists || doc.data()!.ownerId !== uid)
        throw new HttpsError("not-found", "Review not found.");
      const job = doc.data()!;
      if (job.status === "running" && Date.now() - job.createdAt > 600000) {
        await doc.ref.update({
          status: "failed",
          error: "Review was interrupted. Partial results are retained.",
          updatedAt: Date.now(),
        });
        job.status = "failed";
        job.error = "Review was interrupted. Partial results are retained.";
      }
      return { ...job, id: doc.id };
    }
    if (action === "ai.review") return await review(uid, data);
    throw new HttpsError("invalid-argument", "Unknown AI action.");
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e instanceof ProviderError)
      throw new HttpsError("failed-precondition", e.message, {
        reason: e.code,
      });
    throw new HttpsError(
      "invalid-argument",
      "AI request could not be completed. Check your settings and try again.",
    );
  }
}
async function review(uid: string, data: any) {
  if (data.consent !== true)
    throw new HttpsError(
      "failed-precondition",
      "Explicit consent to send manuscript text to your chosen providers is required for each review.",
    );
  if (typeof data.allowMetadataLookup !== "boolean")
    throw new HttpsError(
      "invalid-argument",
      "Choose whether Crossref may receive the paper title and cited DOIs.",
    );
  const paperId = id(data.paperId),
    requestId = id(data.requestId),
    jobId = createHash("sha256").update(`${uid}:${requestId}`).digest("hex");
  const ref = db().collection("aiJobs").doc(jobId),
    prior = await ref.get();
  if (prior.exists) {
    if (
      prior.data()!.scope?.mode &&
      prior.data()!.scope.mode !== (data.coverageMode || "full")
    )
      throw new HttpsError(
        "invalid-argument",
        "Use a new request ID to change review coverage.",
      );
    if (prior.data()!.paperId !== paperId)
      throw new HttpsError(
        "invalid-argument",
        "Use a new request ID for a different manuscript.",
      );
    return { id: prior.id, ...prior.data() };
  }
  const paperDoc = await db().collection("papers").doc(paperId).get();
  if (!paperDoc.exists || paperDoc.data()!.ownerId !== uid)
    throw new HttpsError(
      "permission-denied",
      "Only the manuscript owner may run an AI review.",
    );
  const paper = paperDoc.data()!;
  const mode = data.coverageMode === undefined ? "full" : data.coverageMode;
  if (!["full", "partial"].includes(mode))
    throw new HttpsError(
      "invalid-argument",
      "Choose full extracted text or partial coverage.",
    );
  const excerpt = manuscriptExcerpt(String(paper.text || ""), mode);
  const pdfAnalysis = pdfDiagnostics(paper.pdfAnalysis);
  if (mode === "full" && pdfAnalysis.sourceCoverage === "incomplete")
    throw new HttpsError(
      "failed-precondition",
      "The source PDF extraction is incomplete. Re-upload a smaller or text-readable PDF, or explicitly choose partial coverage before starting.",
    );
  if (excerpt.text.trim().length < 100)
    throw new HttpsError(
      "failed-precondition",
      "Extract or paste at least 100 characters of manuscript text first.",
    );
  const config = (await db().collection("aiSettings").doc(uid).get()).data()
    ?.agents as Record<string, AgentConfig>;
  if (!AGENTS.every((n) => config?.[n]?.model))
    throw new HttpsError(
      "failed-precondition",
      "Choose a provider and model for all five specialists first.",
    );
  const keys = new Map<Provider, string>();
  for (const a of AGENTS) {
    config[a] = normalizeConfig(config[a]);
    const p = provider(config[a].provider);
    if (!keys.has(p)) keys.set(p, await readKey(uid, p));
  }
  const now = Date.now(),
    day = new Date(now).toISOString().slice(0, 10),
    usageRef = db().collection("aiUsage").doc(uid);
  const initial = {
    ownerId: uid,
    paperId,
    title: String(paper.title || ""),
    status: "running",
    createdAt: now,
    updatedAt: now,
    consent: {
      grantedAt: now,
      providers: [...keys.keys()],
      metadataLookup: data.allowMetadataLookup,
      version: "2026-09-21",
    },
    agents: config,
    scope: {
      ...excerpt,
      text: undefined,
      sourceCoverage: pdfAnalysis.sourceCoverage,
      totalPages: pdfAnalysis.totalPages ?? null,
      scannedPages: pdfAnalysis.scannedPages ?? null,
      sourceTextTruncated: pdfAnalysis.textTruncated ?? null,
      visualInspection: false,
    },
    pdfAnalysis,
    stages: Object.fromEntries(
      [...AGENTS, "synthesis"].map((name) => [name, { status: "pending" }]),
    ),
    budget: {
      calls: LIMITS.callsPerReview,
      concurrency: LIMITS.concurrency,
      providerTimeoutMs: LIMITS.providerTimeoutMs,
      jobTimeoutMs: LIMITS.jobTimeoutMs,
      outputTokens: LIMITS.outputTokens,
      reasoningOutputTokens: LIMITS.reasoningOutputTokens,
    },
    results: {},
    errors: [],
    inputHash: createHash("sha256").update(excerpt.text).digest("hex"),
    paperUpdatedAt: paper.updatedAt || null,
    promptVersion: "2026-09-21.3",
  };
  delete initial.scope.text;
  const created = await db().runTransaction(async (tx) => {
    const [u, existing, paperNow] = await Promise.all([
      tx.get(usageRef),
      tx.get(ref),
      tx.get(paperDoc.ref),
    ]);
    if (existing.exists) return false;
    if (!paperNow.exists || paperNow.data()!.ownerId !== uid)
      throw new HttpsError("not-found", "Manuscript was removed.");
    const usage = u.data();
    if (usage?.activeUntil > now)
      throw new HttpsError(
        "resource-exhausted",
        "A review is already running. Wait for it to finish.",
      );
    const count = usage?.day === day ? usage.count : 0;
    if (count >= LIMITS.jobsPerDay)
      throw new HttpsError(
        "resource-exhausted",
        "Daily limit of 10 reviews reached.",
      );
    tx.set(usageRef, {
      ownerId: uid,
      day,
      count: count + 1,
      activeUntil: now + 540000,
      activeJobId: jobId,
    });
    tx.create(ref, initial);
    return true;
  });
  if (!created) return { id: jobId, ...(await ref.get()).data() };
  const results: Record<string, any> = {},
    errors: { agent: string; code: string; message: string }[] = [];
  try {
    const metadata = await collectMetadata(
      excerpt.text,
      String(paper.title || ""),
      data.allowMetadataLookup,
    );
    const sourceIds = new Set<string>(metadata.sources.map((s) => s.id));
    await ref.update({ metadata, updatedAt: Date.now() });
    const payload = {
      manuscript: excerpt.text,
      title: String(paper.title || ""),
      scope: initial.scope,
      bibliographicMetadata: metadata.sources,
      allowedSourceIds: [...sourceIds],
      metadataLimitations: metadata.limitations,
    };
    const deadline = now + LIMITS.jobTimeoutMs;
    async function runStage(name: (typeof AGENTS)[number] | "synthesis") {
      const selected = name === "synthesis" ? config.reviewer : config[name];
      const startedAt = Date.now();
      try {
        if (deadline - startedAt < 10000)
          throw new ProviderError(
            "time_budget",
            "The review time budget was exhausted. Completed findings are retained; no automatic retry was made.",
          );
        await ref.update({
          [`stages.${name}`]: { status: "running", startedAt },
          updatedAt: startedAt,
        });
        const response = await generate(
          selected,
          keys.get(selected.provider)!,
          PROMPTS[name],
          JSON.stringify({
            ...payload,
            pdfAnalysis,
            priorAgents: name === "synthesis" ? results : {},
            priorStageErrors: name === "synthesis" ? errors : [],
          }),
          Math.min(LIMITS.providerTimeoutMs, deadline - Date.now()),
        );
        const result = parseReview(response.text, excerpt.text, sourceIds);
        result.limitations.push(
          "AI findings require human review; no endorsement or scientific validity is guaranteed.",
        );
        result.limitations.push(
          "Review input included the extracted text within the declared scope. Images, visual layout, and equations not present in text were not inspected.",
        );
        if (excerpt.truncated)
          result.limitations.push(
            `Partial mode: only the first ${excerpt.reviewedCharacters} of ${excerpt.totalCharacters} stored characters were supplied.`,
          );
        if (pdfAnalysis.sourceCoverage !== "all_pages_scanned")
          result.limitations.push(
            "Complete source-PDF coverage is not established. See the extraction diagnostics.",
          );
        results[name] = {
          ...result,
          provider: selected.provider,
          model: response.model,
          reasoningEffort: selected.reasoningEffort || "provider_default",
          usage: response.usage,
        };
        // Independent field updates prevent concurrent stages from overwriting one another.
        await ref.update({
          [`results.${name}`]: results[name],
          [`stages.${name}`]: {
            status: "completed",
            startedAt,
            completedAt: Date.now(),
          },
          updatedAt: Date.now(),
        });
      } catch (e) {
        const error = {
          agent: name,
          code: e instanceof ProviderError ? e.code : "failed",
          message:
            e instanceof ProviderError
              ? e.message
              : "This review stage could not be completed.",
        };
        errors.push(error);
        await ref.update({
          [`stages.${name}`]: {
            status: "failed",
            startedAt,
            completedAt: Date.now(),
            error,
          },
          updatedAt: Date.now(),
        });
      }
    }
    await runBounded(AGENTS, LIMITS.concurrency, runStage);
    if (Object.keys(results).length) await runStage("synthesis");
    else {
      errors.push({
        agent: "synthesis",
        code: "no_specialist_results",
        message:
          "Synthesis was skipped because no specialist completed. No synthesis call was charged.",
      });
      await ref.update({
        "stages.synthesis": { status: "skipped", completedAt: Date.now() },
      });
    }
    await ref.update({ errors, updatedAt: Date.now() });
    const status = errors.length
      ? Object.keys(results).length
        ? "partial"
        : "failed"
      : "completed";
    await ref.update({
      status,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch {
    await ref
      .update({
        status: "failed",
        error: "Review interrupted. Partial results are retained.",
        updatedAt: Date.now(),
      })
      .catch(() => {});
  } finally {
    keys.clear();
    await db()
      .runTransaction(async (tx) => {
        const u = await tx.get(usageRef);
        if (u.data()?.activeJobId === jobId)
          tx.update(usageRef, { activeUntil: 0 });
      })
      .catch(() => {});
  }
  return { id: jobId, ...(await ref.get()).data() };
}
