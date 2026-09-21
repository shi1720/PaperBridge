import { getDb, getAppAuth, getPaperBucket, assertAppTenant } from "./runtime";
import { paperListItem } from "./dto";
import {
  FieldValue,
  DocumentReference,
  Transaction,
  WriteBatch,
  Query,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { createHash, randomUUID } from "node:crypto";
import * as D from "./domain";
import { withAccountLease } from "./lifecycle";
import { rateLimit } from "./rate-limit";
import { queueVerificationEmail } from "./verification";

const db = () => getDb();
const doc = (collection: string, id: string) =>
  db().collection(collection).doc(id);
const data = (s: any) => (s.exists ? { ...s.data(), id: s.id } : null);
const rows = (s: any) => s.docs.map((d: any) => ({ ...d.data(), id: d.id }));
const fail = (
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
): never => {
  throw new HttpsError(code, message);
};
const sorted = (items: any[], limit = 100) =>
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const pairId = (a: string, b: string) => hash([a, b].sort().join(":"));
const blockId = (a: string, b: string) => hash(`${a}:${b}`);
const publicProfile = (p: any) => {
  if (!p) return null;
  const { email, ...rest } = p;
  return rest;
};
const publicPost = (p: any) => {
  const { likedBy, ...rest } = p;
  return rest;
};

async function required(collection: string, id: string): Promise<any> {
  const result = data(await doc(collection, id).get());
  return result || fail("not-found", "This item no longer exists.");
}
async function profile(uid: string): Promise<any> {
  return required("profiles", uid);
}
async function ensureUnblocked(a: string, b: string): Promise<void> {
  const records = await db().getAll(
    doc("blocks", blockId(a, b)),
    doc("blocks", blockId(b, a)),
  );
  if (records.some((s) => s.exists))
    fail(
      "permission-denied",
      "Interaction is unavailable between these accounts.",
    );
}
async function hiddenUsers(uid: string): Promise<Set<string>> {
  const [a, b] = await Promise.all([
    db().collection("blocks").where("ownerId", "==", uid).get(),
    db().collection("blocks").where("targetId", "==", uid).get(),
  ]);
  return new Set([
    ...a.docs.map((d) => d.data().targetId),
    ...b.docs.map((d) => d.data().ownerId),
  ]);
}
async function participantRequest(id: string, uid: string): Promise<any> {
  const req = await required("requests", id);
  if (![req.requesterId, req.reviewerId].includes(uid))
    fail("permission-denied", "This request is private.");
  return req;
}
async function readablePaper(
  id: string,
  uid: string,
  sharedNotes = false,
): Promise<any> {
  const paper = await required("papers", id);
  if (paper.deleting) fail("not-found", "This paper has been removed.");
  if (paper.ownerId !== uid) await ensureUnblocked(uid, paper.ownerId);
  if (paper.ownerId === uid || (!sharedNotes && paper.visibility === "public"))
    return paper;
  const requests = rows(
    await db()
      .collection("requests")
      .where("paperId", "==", id)
      .where("reviewerId", "==", uid)
      .get(),
  );
  if (
    !D.canReadPaper(
      sharedNotes ? { ...paper, visibility: "private" } : paper,
      uid,
      requests,
    )
  )
    fail(
      "permission-denied",
      "The author has not shared this manuscript with you.",
    );
  return paper;
}
function revisionMetadata(paper: any): any {
  return {
    version: paper.version || 1,
    storagePath: paper.storagePath || "",
    fileName: paper.fileName || "",
    updatedAt: paper.updatedAt || paper.createdAt || 0,
    title: paper.title || "",
  };
}
function versionHistory(paper: any): any[] {
  return Array.isArray(paper.versions) && paper.versions.length
    ? paper.versions
    : [revisionMetadata(paper)];
}
async function manuscriptDownloadUrl(storagePath: string): Promise<string> {
  if (!storagePath) return "";
  const file = getPaperBucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return "";
  if (
    process.env.STORAGE_EMULATOR_HOST ||
    process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ) {
    const token = randomUUID();
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
    return `http://${(process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST || "").replace(/^https?:\/\//, "")}/v0/b/${getPaperBucket().name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  }
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 10 * 60_000,
  });
  return url;
}
async function chatParticipant(id: string, uid: string): Promise<any> {
  const chat = await required("chats", id);
  if (!chat.members.includes(uid))
    fail("permission-denied", "This conversation is private.");
  return chat;
}
async function notification(
  writer: { set(ref: DocumentReference, value: any): unknown },
  userId: string,
  title: string,
  body: string,
  link: string,
  now: number,
  email?: { to: string; subject: string; body: string },
): Promise<void> {
  const ref = db().collection("notifications").doc();
  writer.set(ref, { userId, title, body, link, read: false, createdAt: now });
  if (email?.to) {
    writer.set(doc("emailOutbox", ref.id), {
      userId,
      to: email.to,
      subject: email.subject,
      body: email.body,
      status: "queued",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}
function siteUrl(): string {
  return process.env.APP_URL || "https://paperbridge.web.app";
}
async function deleteQuery(query: Query): Promise<void> {
  for (;;) {
    const snap = await query.limit(300).get();
    if (snap.empty) return;
    const b = db().batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}
async function removePaper(id: string, uid: string): Promise<void> {
  const paper = await required("papers", id);
  if (paper.ownerId !== uid)
    fail("permission-denied", "Only the author can delete a paper.");
  await doc("papers", id).update({
    deleting: true,
    visibility: "private",
    updatedAt: Date.now(),
  });
  const requests = await db()
    .collection("requests")
    .where("paperId", "==", id)
    .get();
  for (const request of requests.docs) {
    const r = request.data();
    if (D.ACTIVE_STATUSES.includes(r.status))
      await transitionRequest(
        request.id,
        "withdrawn",
        "The author removed this manuscript.",
        uid,
      );
    await request.ref.update({
      paperDeleted: true,
      title: "Deleted manuscript",
      currentPaperTitle: "Deleted manuscript",
      message: "",
      endorsementUrl: "",
    });
  }
  await deleteQuery(db().collection("annotations").where("paperId", "==", id));
  await deleteQuery(db().collection("aiJobs").where("paperId", "==", id));
  const posts = await db().collection("posts").where("paperId", "==", id).get();
  for (const post of posts.docs)
    await post.ref.update({ paperId: null, paperTitle: null });
  await getPaperBucket().deleteFiles({
    prefix: `papers/${uid}/${id}/`,
    force: true,
  });
  await doc("papers", id).delete();
}
async function transitionRequest(
  id: string,
  status: string,
  note: string,
  uid: string,
  deletingAccount = false,
): Promise<any> {
  const ref = doc("requests", id);
  const now = Date.now();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const req: any = data(snap);
    if (!req) fail("not-found", "Request not found.");
    if (![req.requesterId, req.reviewerId].includes(uid))
      fail("permission-denied", "This request is private.");
    const actor = uid === req.requesterId ? "requester" : "reviewer";
    D.checkTransition(req.status, status, actor);
    const otherId = actor === "requester" ? req.reviewerId : req.requesterId;
    const [other, blockA, blockB] = await Promise.all([
      tx.get(doc("users", otherId)),
      tx.get(doc("blocks", blockId(uid, otherId))),
      tx.get(doc("blocks", blockId(otherId, uid))),
    ]);
    if (
      !deletingAccount &&
      status !== "withdrawn" &&
      (blockA.exists || blockB.exists)
    )
      fail(
        "permission-denied",
        "Interaction is unavailable between these accounts.",
      );
    const terminal = !D.ACTIVE_STATUSES.includes(status);
    if (terminal) {
      tx.delete(doc("requestLocks", hash(`${req.paperId}:${req.reviewerId}`)));
      tx.set(
        doc("reviewerQuotas", req.reviewerId),
        { active: FieldValue.increment(-1) },
        { merge: true },
      );
    }
    tx.update(ref, {
      status,
      updatedAt: now,
      ...(status === "endorsed"
        ? { endorsedAt: now, completionSource: "author_reported" }
        : {}),
    });
    if (note)
      tx.set(db().collection("requestMessages").doc(), {
        requestId: id,
        authorId: uid,
        body: note,
        kind: "status",
        status,
        createdAt: now,
      });
    const labels: any = {
      accepted: "offered to help",
      endorsed: "reported endorsement completed on arXiv",
      changes_requested: "requested changes",
      reviewing: "started reviewing",
      declined: "declined the request",
      withdrawn: "withdrew the request",
    };
    const body = `${actor === "requester" ? req.requesterName : req.reviewerName} ${labels[status] || status} for “${req.title}”.`;
    await notification(
      tx,
      otherId,
      "Request update",
      body,
      `/requests/${id}`,
      now,
      {
        to: other.data()?.email,
        subject: `PaperBridge: ${labels[status] || status}`,
        body: `${body}\n\n${siteUrl()}/requests/${id}\n\nAn offer to help is not an arXiv endorsement. Completion is reported by the author.`,
      },
    );
    return { ...req, status, updatedAt: now };
  });
}

export async function handleApi(
  action: string,
  input: any,
  uid: string,
  authToken: any = {},
): Promise<any> {
  assertAppTenant(authToken);
  return action === "account.delete"
    ? dispatchApi(action, input, uid, authToken)
    : withAccountLease(uid, () => dispatchApi(action, input, uid, authToken));
}
async function dispatchApi(
  action: string,
  input: any,
  uid: string,
  authToken: any = {},
): Promise<any> {
  if (!uid) fail("unauthenticated", "Sign in to continue.");
  if ((await doc("deletionJobs", uid).get()).exists)
    fail(
      "failed-precondition",
      "This account is being deleted or has been deleted.",
    );
  await rateLimit(uid, action);
  const verifiedActions = [
    "request.create",
    "request.status",
    "request.comment",
    "feed.post",
    "feed.like",
    "feed.comment",
    "chat.send",
    "follow.toggle",
    "report.create",
  ];
  if (verifiedActions.includes(action) && authToken.email_verified !== true)
    fail(
      "failed-precondition",
      "Verify your email address before participating.",
    );
  switch (action) {
    case "auth.sendVerification":
      return queueVerificationEmail(uid);
    case "profile.save": {
      const p = D.profileInput(input.profile);
      const now = Date.now();
      const user = await getAppAuth().getUser(uid);
      return db().runTransaction(async (tx) => {
        const [existing, tombstone] = await Promise.all([
          tx.get(doc("profiles", uid)),
          tx.get(doc("deletionJobs", uid)),
        ]);
        if (tombstone.exists || user.disabled)
          fail("failed-precondition", "This account is being deleted.");
        tx.set(
          doc("profiles", uid),
          {
            ...p,
            id: uid,
            createdAt: existing.data()?.createdAt || now,
            updatedAt: now,
          },
          { merge: true },
        );
        tx.set(
          doc("users", uid),
          {
            email: user.email || "",
            emailVerified: user.emailVerified,
            updatedAt: now,
          },
          { merge: true },
        );
        return { ...p, id: uid };
      });
    }
    case "profile.get": {
      const id = input.id ? D.identifier(input.id) : uid;
      const p = data(await doc("profiles", id).get());
      if (!p) {
        if (id === uid) return null;
        fail("not-found", "This profile does not exist.");
      }
      if (id !== uid) {
        await ensureUnblocked(uid, id);
        if (!p.publicProfile)
          fail("permission-denied", "This profile is private.");
      }
      return publicProfile(p);
    }
    case "directory.list": {
      const blocked = await hiddenUsers(uid);
      let query: Query = db()
        .collection("profiles")
        .where("role", "==", "endorser")
        .where("publicProfile", "==", true);
      if (input.category)
        query = query.where(
          "categories",
          "array-contains",
          D.category(input.category),
        );
      const search = D.text(input.search, "Search", 100, false).toLowerCase();
      return rows(await query.limit(200).get())
        .filter(
          (p: any) =>
            p.id !== uid &&
            !blocked.has(p.id) &&
            (!search ||
              `${p.name} ${p.institution} ${p.headline}`
                .toLowerCase()
                .includes(search)),
        )
        .map(publicProfile);
    }
    case "paper.save": {
      const p = input.paper || {};
      const id = p.id ? D.identifier(p.id) : db().collection("papers").doc().id;
      return db().runTransaction(async (tx) => {
        const [tombstone, existing] = await Promise.all([
          tx.get(doc("deletionJobs", uid)),
          tx.get(doc("papers", id)),
        ]);
        if (tombstone.exists)
          fail("failed-precondition", "This account is being deleted.");
        const previous = existing.data();
        if (previous && previous.ownerId !== uid)
          fail("permission-denied", "Only the author can edit a paper.");
        if (previous?.deleting)
          fail("failed-precondition", "This paper is being deleted.");
        const currentVersion = previous?.version || 1;
        const expectedVersion = p.expectedVersion ?? input.expectedVersion;
        if (
          expectedVersion !== undefined &&
          (!Number.isInteger(expectedVersion) ||
            expectedVersion !== currentVersion)
        )
          fail(
            "failed-precondition",
            "A newer revision is available. Reload the manuscript before saving.",
          );
        const activeRequests = await tx.get(
          db()
            .collection("requests")
            .where("paperId", "==", id)
            .where("status", "in", D.ACTIVE_STATUSES),
        );
        const authors = Array.isArray(p.authors)
          ? D.stringArray(p.authors, "Authors", 50, 150)
          : D.text(p.authors, "Authors", 2000, false);
        const now = Date.now();
        const next = {
          id,
          ownerId: uid,
          title: D.text(p.title, "Title", 300),
          abstract: D.text(p.abstract, "Abstract", 12_000),
          category: D.category(p.category),
          authors,
          storagePath: D.storagePath(
            p.storagePath ?? previous?.storagePath,
            uid,
            id,
          ),
          fileName: D.text(
            p.fileName ?? previous?.fileName,
            "File name",
            250,
            false,
          ),
          text: D.text(
            p.text ?? previous?.text,
            "Manuscript text",
            500_000,
            false,
          ),
          visibility: p.visibility === "public" ? "public" : "private",
          createdAt: previous?.createdAt || now,
          updatedAt: now,
          version: currentVersion,
          versions: [] as any[],
        };
        if (
          previous &&
          next.category !== previous.category &&
          !activeRequests.empty
        )
          fail(
            "failed-precondition",
            "The category is fixed while a review request is active. Withdraw active requests before changing it.",
          );
        const revised =
          !!previous &&
          (next.storagePath !== (previous.storagePath || "") ||
            next.text !== (previous.text || ""));
        next.version = previous ? currentVersion + (revised ? 1 : 0) : 1;
        const history = previous ? versionHistory(previous) : [];
        next.versions = [
          ...history.filter((v: any) => v.version !== next.version),
          revisionMetadata(next),
        ].slice(-20);
        tx.set(doc("papers", id), next);
        if (revised) {
          for (const request of activeRequests.docs) {
            const r = request.data();
            tx.update(request.ref, {
              paperVersion: next.version,
              paperUpdatedAt: now,
              currentPaperTitle: next.title,
              revisionAvailable: true,
              updatedAt: now,
            });
            await notification(
              tx,
              r.reviewerId,
              "Manuscript revised",
              `A new revision (v${next.version}) of “${next.title}” is available. Earlier notes remain attached to their original revision.`,
              `/requests/${request.id}`,
              now,
            );
          }
        }
        return next;
      });
    }
    case "paper.list":
      return sorted(
        rows(
          await db()
            .collection("papers")
            .where("ownerId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(200)
            .get(),
        ),
      ).map(paperListItem);
    case "paper.get": {
      const paper = await readablePaper(D.identifier(input.id), uid);
      return {
        ...paper,
        version: paper.version || 1,
        versions: versionHistory(paper),
        downloadUrl: await manuscriptDownloadUrl(paper.storagePath),
      };
    }
    case "paper.version.get": {
      const paper = await readablePaper(D.identifier(input.id), uid, true);
      const version = D.number(
        input.version,
        "Revision",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isInteger(version))
        fail("invalid-argument", "Choose a whole-number revision.");
      const versions = versionHistory(paper);
      const selected = versions.find((v: any) => v.version === version);
      if (!selected)
        fail(
          "not-found",
          "That revision is no longer in the available history.",
        );
      return {
        ...paper,
        ...selected,
        id: paper.id,
        versions,
        currentVersion: paper.version || 1,
        text: version === (paper.version || 1) ? paper.text || "" : "",
        downloadUrl: await manuscriptDownloadUrl(selected.storagePath),
      };
    }
    case "paper.delete":
      await removePaper(D.identifier(input.id), uid);
      return { deleted: true };
    case "request.create": {
      const paperId = D.identifier(input.paperId);
      const reviewerId = D.identifier(input.reviewerId);
      if (reviewerId === uid)
        fail("invalid-argument", "Choose another researcher.");
      const message = D.text(input.message, "Message", 5000);
      const endorsementUrl = D.arxivUrl(input.endorsementUrl, true);
      const now = Date.now();
      const week = D.weekStart(now);
      const ref = db().collection("requests").doc();
      const lock = doc("requestLocks", hash(`${paperId}:${reviewerId}`));
      return db().runTransaction(async (tx) => {
        const refs = [
          doc("papers", paperId),
          doc("profiles", reviewerId),
          doc("profiles", uid),
          doc("users", reviewerId),
          doc("users", uid),
          doc("reviewerQuotas", reviewerId),
          lock,
          doc("blocks", blockId(uid, reviewerId)),
          doc("blocks", blockId(reviewerId, uid)),
          doc("deletionJobs", uid),
          doc("deletionJobs", reviewerId),
        ];
        const [
          ps,
          rs,
          us,
          reviewerUser,
          requesterUser,
          quota,
          locked,
          ba,
          bb,
          requesterDeleted,
          reviewerDeleted,
        ] = await Promise.all(refs.map((r) => tx.get(r)));
        const p: any = ps.data();
        const r: any = rs.data();
        const u: any = us.data();
        const q = quota.data();
        if (requesterDeleted.exists || reviewerDeleted.exists)
          fail("failed-precondition", "This account is unavailable.");
        if (!p || p.deleting || p.ownerId !== uid)
          fail("permission-denied", "Choose one of your manuscripts.");
        if (
          !r ||
          r.role !== "endorser" ||
          !r.publicProfile ||
          !r.acceptingRequests ||
          !r.eligibilitySelfAttested
        )
          fail(
            "failed-precondition",
            "This researcher is not accepting requests.",
          );
        if (!u) fail("failed-precondition", "Complete your profile first.");
        if (ba.exists || bb.exists)
          fail(
            "permission-denied",
            "Interaction is unavailable between these accounts.",
          );
        if (!r.categories.includes(p.category))
          fail(
            "failed-precondition",
            "Choose an endorser for this exact arXiv category.",
          );
        if (locked.exists)
          fail(
            "already-exists",
            "You already have an active request for this manuscript with this researcher.",
          );
        const received = q?.week === week ? q.received || 0 : 0;
        const active = Math.max(0, q?.active || 0);
        if (received >= r.weeklyCapacity || active >= r.weeklyCapacity)
          fail(
            "resource-exhausted",
            "This researcher has reached their review capacity. Choose another researcher or try later.",
          );
        const request = {
          id: ref.id,
          paperId,
          title: p.title,
          paperVersion: p.version || 1,
          currentPaperTitle: p.title,
          category: p.category,
          requesterId: uid,
          reviewerId,
          requesterName: u.name,
          reviewerName: r.name,
          message,
          endorsementUrl,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        tx.create(ref, request);
        tx.create(lock, { requestId: ref.id, createdAt: now });
        tx.set(doc("reviewerQuotas", reviewerId), {
          week,
          received: received + 1,
          active: active + 1,
        });
        await notification(
          tx,
          uid,
          "Request submitted",
          `Your request for “${p.title}” was sent to ${r.name}.`,
          `/requests/${ref.id}`,
          now,
          {
            to: requesterUser.data()?.email,
            subject: "PaperBridge: request submitted",
            body: `Your request for “${p.title}” was successfully submitted to ${r.name}.\n\nTrack your request: ${siteUrl()}/requests/${ref.id}\n\nThis request does not guarantee endorsement.`,
          },
        );
        await notification(
          tx,
          reviewerId,
          "New endorsement request",
          `${u.name} would like your feedback on “${p.title}”.`,
          `/requests/${ref.id}`,
          now,
          {
            to: reviewerUser.data()?.email,
            subject: "PaperBridge: new review request",
            body: `${u.name} requested review of “${p.title}” in ${p.category}.\n\nReview privately: ${siteUrl()}/requests/${ref.id}\n\nYour arXiv eligibility is category-specific. Please check arXiv before offering to help.`,
          },
        );
        return request;
      });
    }
    case "request.list": {
      const [a, b] = await Promise.all([
        db()
          .collection("requests")
          .where("requesterId", "==", uid)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
        db()
          .collection("requests")
          .where("reviewerId", "==", uid)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
      ]);
      return sorted([...rows(a), ...rows(b)]);
    }
    case "request.get":
      return participantRequest(D.identifier(input.id), uid);
    case "request.status":
      return transitionRequest(
        D.identifier(input.id),
        D.text(input.status, "Status", 40),
        D.text(input.note, "Note", 5000, false),
        uid,
      );
    case "request.messages": {
      const id = D.identifier(input.id);
      await participantRequest(id, uid);
      return sorted(
        rows(
          await db()
            .collection("requestMessages")
            .where("requestId", "==", id)
            .orderBy("createdAt", "desc")
            .limit(500)
            .get(),
        ),
        500,
      ).reverse();
    }
    case "request.comment": {
      const id = D.identifier(input.id);
      const req = await participantRequest(id, uid);
      const otherId =
        req.requesterId === uid ? req.reviewerId : req.requesterId;
      await ensureUnblocked(uid, otherId);
      if (["withdrawn", "declined"].includes(req.status))
        fail("failed-precondition", "This request is closed.");
      const body = D.text(input.body, "Comment", 10_000);
      const p = await profile(uid);
      const ref = db().collection("requestMessages").doc();
      const now = Date.now();
      const message = {
        id: ref.id,
        requestId: id,
        authorId: uid,
        authorName: p.name,
        body,
        kind: "comment",
        createdAt: now,
      };
      const batch = db().batch();
      batch.create(ref, message);
      await notification(
        batch,
        otherId,
        "New review comment",
        `${p.name} left feedback on “${req.title}”.`,
        `/requests/${id}`,
        now,
      );
      await batch.commit();
      return message;
    }
    case "annotation.list": {
      const paperId = D.identifier(input.paperId);
      await readablePaper(paperId, uid, true);
      return sorted(
        rows(
          await db()
            .collection("annotations")
            .where("paperId", "==", paperId)
            .orderBy("createdAt", "desc")
            .limit(500)
            .get(),
        ),
        500,
      )
        .filter((a: any) => a.authorId === uid || a.visibility === "shared")
        .map((a: any) => ({ ...a, paperVersion: a.paperVersion || 1 }));
    }
    case "annotation.save": {
      const paperId = D.identifier(input.paperId);
      await readablePaper(paperId, uid, true);
      const id = input.id
        ? D.identifier(input.id)
        : db().collection("annotations").doc().id;
      return db().runTransaction(async (tx) => {
        const tombstone = await tx.get(doc("deletionJobs", uid));
        if (tombstone.exists)
          fail("failed-precondition", "This account is being deleted.");
        const [previous, paperSnapshot] = await Promise.all([
          tx.get(doc("annotations", id)),
          tx.get(doc("papers", paperId)),
        ]);
        const paper = paperSnapshot.data();
        if (!paper || paper.deleting)
          fail("not-found", "This manuscript is no longer available.");
        const version = paper!.version || 1;
        if (
          input.paperVersion !== undefined &&
          (!Number.isInteger(input.paperVersion) ||
            input.paperVersion !== version)
        )
          fail(
            "failed-precondition",
            "The manuscript has a newer revision. Reload it before adding a note.",
          );
        if (paper!.ownerId !== uid) {
          const requests = await tx.get(
            db()
              .collection("requests")
              .where("paperId", "==", paperId)
              .where("reviewerId", "==", uid),
          );
          if (
            !requests.docs.some((r) =>
              D.ACTIVE_STATUSES.includes(r.data().status),
            )
          )
            fail(
              "permission-denied",
              "This manuscript is no longer shared with you.",
            );
        }
        if (previous.exists && (previous.data()?.paperVersion || 1) !== version)
          fail(
            "failed-precondition",
            "Notes on an earlier revision are archived. Add a new note on the current revision.",
          );
        if (
          previous.exists &&
          (previous.data()?.authorId !== uid ||
            previous.data()?.paperId !== paperId)
        )
          fail("permission-denied", "You can edit only your notes.");
        const colors = ["yellow", "green", "blue", "pink", "purple"];
        const color = colors.includes(input.color) ? input.color : "yellow";
        const rects = Array.isArray(input.rects)
          ? input.rects.slice(0, 50).map((r: any) => ({
              x: D.number(r.x, "Highlight x", 0, 1),
              y: D.number(r.y, "Highlight y", 0, 1),
              width: D.number(r.width, "Highlight width", 0, 1),
              height: D.number(r.height, "Highlight height", 0, 1),
            }))
          : [];
        const annotation = {
          id,
          paperId,
          paperVersion: version,
          authorId: uid,
          page: Math.floor(D.number(input.page, "Page", 1, 10000)),
          quote: D.text(input.quote, "Quote", 10000, false),
          body: D.text(input.body, "Note", 10000, false),
          color,
          visibility: input.visibility === "shared" ? "shared" : "private",
          rects,
          createdAt: previous.data()?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        if (!annotation.body && !annotation.quote && !rects.length)
          fail("invalid-argument", "Select text or write a note.");
        tx.set(doc("annotations", id), annotation);
        return annotation;
      });
    }
    case "annotation.delete": {
      const id = D.identifier(input.id);
      const a = await required("annotations", id);
      if (a.authorId !== uid)
        fail("permission-denied", "You can delete only your notes.");
      await doc("annotations", id).delete();
      return { deleted: true };
    }
    case "feed.list": {
      const blocked = await hiddenUsers(uid);
      const all = rows(
        await db()
          .collection("posts")
          .orderBy("createdAt", "desc")
          .limit(100)
          .get(),
      );
      const likes = await db()
        .collection("likes")
        .where("userId", "==", uid)
        .get();
      const liked = new Set(likes.docs.map((d) => d.data().postId));
      return all
        .filter((p: any) => !blocked.has(p.authorId))
        .map((p: any) => ({ ...publicPost(p), liked: liked.has(p.id) }));
    }
    case "feed.post": {
      const p = await profile(uid);
      const body = D.text(input.body, "Post", 10000);
      const paperId = input.paperId ? D.identifier(input.paperId) : null;
      let paperTitle = null;
      if (paperId) {
        const paper = await required("papers", paperId);
        if (paper.ownerId !== uid || paper.visibility !== "public")
          fail(
            "failed-precondition",
            "Only your public manuscripts can be attached to a feed post.",
          );
        paperTitle = paper.title;
      }
      const ref = db().collection("posts").doc();
      const post = {
        id: ref.id,
        authorId: uid,
        authorName: p.name,
        authorHeadline: p.headline,
        body,
        paperId,
        paperTitle,
        arxivUrl: D.arxivUrl(input.arxivUrl),
        likeCount: 0,
        commentCount: 0,
        createdAt: Date.now(),
      };
      await ref.create(post);
      return post;
    }
    case "feed.like": {
      const id = D.identifier(input.id);
      const post = await required("posts", id);
      await ensureUnblocked(uid, post.authorId);
      const like = doc("likes", hash(`${uid}:${id}`));
      return db().runTransaction(async (tx) => {
        const [l, p] = await Promise.all([
          tx.get(like),
          tx.get(doc("posts", id)),
        ]);
        if (!p.exists) fail("not-found", "Post removed.");
        const liked = !l.exists;
        if (liked)
          tx.create(like, { userId: uid, postId: id, createdAt: Date.now() });
        else tx.delete(like);
        const likeCount = Math.max(
          0,
          (p.data()?.likeCount || 0) + (liked ? 1 : -1),
        );
        tx.update(doc("posts", id), { likeCount });
        return { liked, likeCount };
      });
    }
    case "feed.comments": {
      const id = D.identifier(input.id);
      const post = await required("posts", id);
      await ensureUnblocked(uid, post.authorId);
      const blocked = await hiddenUsers(uid);
      return sorted(
        rows(
          await db()
            .collection("postComments")
            .where("postId", "==", id)
            .orderBy("createdAt", "desc")
            .limit(300)
            .get(),
        ),
        300,
      )
        .reverse()
        .filter((c: any) => !blocked.has(c.authorId));
    }
    case "feed.comment": {
      const id = D.identifier(input.id);
      const post = await required("posts", id);
      await ensureUnblocked(uid, post.authorId);
      const p = await profile(uid);
      const body = D.text(input.body, "Comment", 5000);
      const ref = db().collection("postComments").doc();
      const comment = {
        id: ref.id,
        postId: id,
        authorId: uid,
        authorName: p.name,
        body,
        createdAt: Date.now(),
      };
      const batch = db().batch();
      batch.create(ref, comment);
      batch.update(doc("posts", id), { commentCount: FieldValue.increment(1) });
      if (post.authorId !== uid)
        await notification(
          batch,
          post.authorId,
          "New comment",
          `${p.name} commented on your post.`,
          "/feed",
          Date.now(),
        );
      await batch.commit();
      return comment;
    }
    case "feed.delete": {
      const id = D.identifier(input.id);
      const post = await required("posts", id);
      if (post.authorId !== uid)
        fail("permission-denied", "You can delete only your posts.");
      await doc("posts", id).delete();
      await deleteQuery(
        db().collection("postComments").where("postId", "==", id),
      );
      await deleteQuery(db().collection("likes").where("postId", "==", id));
      return { deleted: true };
    }
    case "follow.toggle": {
      const id = D.identifier(input.id);
      if (id === uid) fail("invalid-argument", "You cannot follow yourself.");
      await ensureUnblocked(uid, id);
      const target = await profile(id);
      if (!target.publicProfile)
        fail("permission-denied", "This profile is private.");
      const ref = doc("follows", hash(`${uid}:${id}`));
      return db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) tx.delete(ref);
        else
          tx.create(ref, {
            followerId: uid,
            followingId: id,
            createdAt: Date.now(),
          });
        return { following: !snap.exists };
      });
    }
    case "follow.list": {
      const [a, b] = await Promise.all([
        db().collection("follows").where("followerId", "==", uid).get(),
        db().collection("follows").where("followingId", "==", uid).get(),
      ]);
      return { following: rows(a), followers: rows(b) };
    }
    case "chat.list":
      return rows(
        await db()
          .collection("chats")
          .where("members", "array-contains", uid)
          .orderBy("updatedAt", "desc")
          .limit(100)
          .get(),
      );
    case "chat.open": {
      const otherId = D.identifier(input.userId);
      if (otherId === uid)
        fail("invalid-argument", "Choose another researcher.");
      await ensureUnblocked(uid, otherId);
      const [a, b] = await Promise.all([profile(uid), profile(otherId)]);
      if (!b.publicProfile)
        fail("permission-denied", "This profile is private.");
      const id = pairId(uid, otherId);
      const ref = doc("chats", id);
      return db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return data(snap);
        const chat = {
          id,
          members: [uid, otherId],
          names: { [uid]: a.name, [otherId]: b.name },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastMessage: "",
        };
        tx.create(ref, chat);
        return chat;
      });
    }
    case "chat.messages": {
      const id = D.identifier(input.id);
      await chatParticipant(id, uid);
      return sorted(
        rows(
          await db()
            .collection("chatMessages")
            .where("chatId", "==", id)
            .orderBy("createdAt", "desc")
            .limit(500)
            .get(),
        ),
        500,
      ).reverse();
    }
    case "chat.send": {
      const id = D.identifier(input.id);
      const chat = await chatParticipant(id, uid);
      const otherId = chat.members.find((m: string) => m !== uid);
      await ensureUnblocked(uid, otherId);
      const body = D.text(input.body, "Message", 10000);
      const ref = db().collection("chatMessages").doc();
      const now = Date.now();
      const message = {
        id: ref.id,
        chatId: id,
        authorId: uid,
        body,
        createdAt: now,
      };
      const batch = db().batch();
      batch.create(ref, message);
      batch.update(doc("chats", id), {
        lastMessage: body.slice(0, 200),
        updatedAt: now,
      });
      await notification(
        batch,
        otherId,
        "New message",
        `${chat.names[uid] || "A researcher"} sent you a message.`,
        `/messages/${id}`,
        now,
      );
      await batch.commit();
      return message;
    }
    case "notifications.list": {
      const notifications = sorted(
        rows(
          await db()
            .collection("notifications")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(200)
            .get(),
        ),
      );
      if (!notifications.length) return [];
      const emails = await db().getAll(
        ...notifications.map((n) => doc("emailOutbox", n.id)),
      );
      const status = new Map(
        emails
          .filter((s) => s.exists)
          .map((s) => [
            s.id,
            {
              emailStatus: s.data()?.status,
              emailIssue: s.data()?.deliveryIssue || null,
            },
          ]),
      );
      return notifications.map((n) => ({ ...n, ...status.get(n.id) }));
    }
    case "notifications.read": {
      const unread = await db()
        .collection("notifications")
        .where("userId", "==", uid)
        .where("read", "==", false)
        .limit(400)
        .get();
      const batch = db().batch();
      unread.docs.forEach((n) => batch.update(n.ref, { read: true }));
      await batch.commit();
      return { updated: unread.size };
    }
    case "leaderboard.list": {
      const period = input.period === "all" ? "all" : "week";
      let query: Query = db()
        .collection("requests")
        .where("status", "==", "endorsed");
      if (period === "week")
        query = query.where("endorsedAt", ">=", D.weekStart());
      const all = rows(await query.limit(5000).get());
      const counts = new Map<string, number>();
      all.forEach((r: any) =>
        counts.set(r.reviewerId, (counts.get(r.reviewerId) || 0) + 1),
      );
      const ids = [...counts.keys()];
      if (!ids.length) return [];
      const blocked = await hiddenUsers(uid);
      const profiles = await db().getAll(
        ...ids.map((id) => doc("profiles", id)),
      );
      return profiles
        .filter(
          (p) => p.exists && p.data()?.publicProfile && !blocked.has(p.id),
        )
        .map((p) => ({
          ...publicProfile(data(p)),
          endorsements: counts.get(p.id),
          completionSource: "author_reported",
        }))
        .sort((a, b) => b.endorsements! - a.endorsements!)
        .slice(0, 50);
    }
    case "report.create": {
      const targetId = D.identifier(input.targetId);
      const reason = D.text(input.reason, "Reason", 3000);
      const type =
        D.text(input.targetType, "Report type", 40, false) || "unspecified";
      const ref = db().collection("reports").doc();
      await ref.create({
        reporterId: uid,
        targetId,
        targetType: type,
        reason,
        status: "open",
        createdAt: Date.now(),
      });
      return { id: ref.id, submitted: true };
    }
    case "block.toggle": {
      const targetId = D.identifier(input.userId);
      if (targetId === uid)
        fail("invalid-argument", "You cannot block yourself.");
      const ref = doc("blocks", blockId(uid, targetId));
      const existing = await ref.get();
      if (existing.exists) {
        await ref.delete();
        return { blocked: false };
      }
      const batch = db().batch();
      batch.set(ref, { ownerId: uid, targetId, createdAt: Date.now() });
      batch.delete(doc("follows", hash(`${uid}:${targetId}`)));
      batch.delete(doc("follows", hash(`${targetId}:${uid}`)));
      await batch.commit();
      return { blocked: true };
    }
    case "block.list":
      return rows(
        await db().collection("blocks").where("ownerId", "==", uid).get(),
      );
    case "account.export":
      return exportAccount(uid);
    case "account.delete": {
      if (!authToken.auth_time || Date.now() / 1000 - authToken.auth_time > 300)
        fail(
          "failed-precondition",
          "Sign in again, then delete your account within five minutes.",
        );
      await doc("deletionJobs", uid).set(
        {
          uid,
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      const deleted = await deleteAccount(uid);
      return { deleted, pending: !deleted };
    }
    default:
      fail("invalid-argument", "Unknown action.");
  }
}

async function exportAccount(uid: string): Promise<any> {
  const collections: Record<string, string[]> = {
    papers: ["ownerId"],
    requests: ["requesterId", "reviewerId"],
    annotations: ["authorId"],
    posts: ["authorId"],
    postComments: ["authorId"],
    follows: ["followerId", "followingId"],
    likes: ["userId"],
    notifications: ["userId"],
    blocks: ["ownerId"],
    reports: ["reporterId"],
    requestMessages: ["authorId"],
    chatMessages: ["authorId"],
    aiJobs: ["ownerId"],
  };
  const result: any = {
    exportedAt: new Date().toISOString(),
    profile: data(await doc("profiles", uid).get()),
    account: data(await doc("users", uid).get()),
  };
  for (const [collection, fields] of Object.entries(collections)) {
    const snaps = await Promise.all(
      fields.map((field) =>
        db().collection(collection).where(field, "==", uid).get(),
      ),
    );
    result[collection] = [
      ...new Map(snaps.flatMap(rows).map((r: any) => [r.id, r])).values(),
    ];
  }
  result.aiSettings = data(await doc("aiSettings", uid).get());
  result.chats = rows(
    await db()
      .collection("chats")
      .where("members", "array-contains", uid)
      .get(),
  );
  // Provider credentials, delivery destinations, anti-abuse records, and other users' private notes never enter exports.
  return result;
}
export async function deleteAccount(uid: string): Promise<boolean> {
  try {
    await getAppAuth().updateUser(uid, { disabled: true });
    await getAppAuth().revokeRefreshTokens(uid);
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  await doc("profiles", uid).set(
    { publicProfile: false, acceptingRequests: false },
    { merge: true },
  );
  const inFlight = await db()
    .collection("operationLeases")
    .where("ownerId", "==", uid)
    .where("expiresAt", ">", Date.now())
    .limit(1)
    .get();
  if (!inFlight.empty) return false;
  const papers = await db()
    .collection("papers")
    .where("ownerId", "==", uid)
    .get();
  for (const p of papers.docs) await removePaper(p.id, uid);
  const requests = await db()
    .collection("requests")
    .where("reviewerId", "==", uid)
    .get();
  for (const r of requests.docs) {
    if (D.ACTIVE_STATUSES.includes(r.data().status))
      await transitionRequest(
        r.id,
        "declined",
        "The reviewer deleted their account.",
        uid,
        true,
      );
  }
  const posts = await db()
    .collection("posts")
    .where("authorId", "==", uid)
    .get();
  for (const p of posts.docs) {
    await deleteQuery(
      db().collection("postComments").where("postId", "==", p.id),
    );
    await deleteQuery(db().collection("likes").where("postId", "==", p.id));
    await p.ref.delete();
  }
  const comments = await db()
    .collection("postComments")
    .where("authorId", "==", uid)
    .get();
  for (const c of comments.docs) {
    const b = db().batch();
    b.delete(c.ref);
    const post = await doc("posts", c.data().postId).get();
    if (post.exists)
      b.update(post.ref, { commentCount: FieldValue.increment(-1) });
    await b.commit();
  }
  const likes = await db().collection("likes").where("userId", "==", uid).get();
  for (const l of likes.docs) {
    const b = db().batch();
    b.delete(l.ref);
    const post = await doc("posts", l.data().postId).get();
    if (post.exists)
      b.update(post.ref, { likeCount: FieldValue.increment(-1) });
    await b.commit();
  }
  for (const field of ["requesterId", "reviewerId"]) {
    const snap = await db()
      .collection("requests")
      .where(field, "==", uid)
      .get();
    for (const r of snap.docs)
      await r.ref.update({
        [field]: "deleted",
        [field === "requesterId" ? "requesterName" : "reviewerName"]:
          "Deleted account",
        message: "",
        endorsementUrl: "",
      });
  }
  const chats = await db()
    .collection("chats")
    .where("members", "array-contains", uid)
    .get();
  for (const c of chats.docs) {
    await c.ref.update({
      members: c.data().members.filter((m: string) => m !== uid),
      [`names.${uid}`]: "Deleted account",
      lastMessage: "",
      updatedAt: Date.now(),
    });
  }
  const purge: Record<string, string[]> = {
    annotations: ["authorId"],
    requestMessages: ["authorId"],
    chatMessages: ["authorId"],
    follows: ["followerId", "followingId"],
    notifications: ["userId"],
    emailOutbox: ["userId"],
    blocks: ["ownerId", "targetId"],
    reports: ["reporterId"],
    aiJobs: ["ownerId"],
    aiKeys: ["ownerId"],
    aiRuns: ["userId"],
  };
  for (const [collection, fields] of Object.entries(purge))
    for (const field of fields)
      await deleteQuery(db().collection(collection).where(field, "==", uid));
  await getPaperBucket().deleteFiles({ prefix: `papers/${uid}/`, force: true });
  for (const collection of [
    "profiles",
    "users",
    "aiSettings",
    "aiCredentials",
    "aiUsage",
    "reviewerQuotas",
    "authEmailLimits",
  ])
    await db().recursiveDelete(doc(collection, uid));
  try {
    await getAppAuth().deleteUser(uid);
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  await deleteQuery(
    db().collection("operationLeases").where("ownerId", "==", uid),
  );
  await doc("deletionJobs", uid).set(
    { status: "complete", completedAt: Date.now(), updatedAt: Date.now() },
    { merge: true },
  );
  return true;
}
