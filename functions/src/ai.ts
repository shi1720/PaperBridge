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
            "Configure all three review agents.",
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
        agents[name] = { provider: p, model: c.model };
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
  const paper = paperDoc.data()!,
    excerpt = manuscriptExcerpt(String(paper.text || ""));
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
      "Choose a provider and model for all three agents first.",
    );
  const keys = new Map<Provider, string>();
  for (const a of AGENTS) {
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
    scope: { ...excerpt, text: undefined },
    results: {},
    errors: [],
    inputHash: createHash("sha256").update(excerpt.text).digest("hex"),
    paperUpdatedAt: paper.updatedAt || null,
    promptVersion: "2026-09-21.2",
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
    for (const name of [...AGENTS, "synthesis"] as const) {
      // Preserve useful completed stages when a later provider fails, and avoid pretending a synthesis exists.
      const selected = name === "synthesis" ? config.reviewer : config[name];
      try {
        const priorAgents =
          name === "reviewer" || name === "synthesis" ? results : {};
        const response = await generate(
          selected,
          keys.get(selected.provider)!,
          PROMPTS[name],
          JSON.stringify({ ...payload, priorAgents, priorStageErrors: errors }),
        );
        const result = parseReview(response.text, excerpt.text, sourceIds);
        result.limitations.push(
          "AI findings require human review; no endorsement or scientific validity is guaranteed.",
        );
        result.limitations.push(
          "Only extracted text was reviewed; figures, equations and PDF layout may be missing.",
        );
        if (excerpt.truncated)
          result.limitations.push(
            `Only the first ${excerpt.reviewedCharacters} of ${excerpt.totalCharacters} characters were reviewed. Figures, equations and PDF layout may be missing from extracted text.`,
          );
        results[name] = {
          ...result,
          provider: selected.provider,
          model: response.model,
          usage: response.usage,
        };
      } catch (e) {
        errors.push({
          agent: name,
          code: e instanceof ProviderError ? e.code : "failed",
          message:
            e instanceof ProviderError
              ? e.message
              : "This review stage could not be completed.",
        });
      }
      await ref.update({ results, errors, updatedAt: Date.now() });
    }
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
