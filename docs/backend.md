# Backend operation and verification

The callable `paperbridgeApi` in `us-central1` is the only Firestore application entrypoint. Firebase Authentication is required for all actions. Participation (requests, status changes, discussions, likes, following, chat and reports) additionally requires a verified email. Direct Firestore access is denied. User emails, endorsement URLs, messages, manuscript text, notes and AI credentials are not exposed in the directory or feed.

`functions/src/api.ts` implements the contract in `docs/contract.md`. All timestamps are milliseconds. Returned documents include `id`. A missing own profile returns `null` for onboarding; another missing profile remains a `not-found` error. Categories are validated against the same 155 canonical IDs offered by the UI. New APIs beyond the original contract: `block.list` returns the caller's block records. `notifications.list` includes `emailStatus` and `emailIssue` when an email was queued; it never includes the recipient address. `account.delete` returns `{deleted,pending}`; if an operation was already running, pending deletion is completed automatically after it ends.

## Endorsement and privacy semantics

- Eligibility is self-attested via `eligibilitySelfAttested`; accepting requests requires an endorser role and at least one exact category. Pausing takes effect transactionally for new requests.
- A request transaction checks duplicate active requests, category, account blocks, public availability and weekly intake/open-request capacity. Weeks begin Monday at 00:00 UTC. Declining/withdrawing releases open capacity but does not erase that week's intake.
- `accepted` is an offer to help. Only the requester can report `endorsed` after acceptance. The leaderboard explicitly labels completions as author-reported; it is not verification by arXiv.
- A private manuscript is readable by its author and active reviewers. Withdrawal/decline removes new access immediately. Shared annotation access remains restricted to author/active reviewer even if the manuscript is public. Personal notes remain author-only.
- `paper.get` supplies a signed download URL valid for ten minutes. An already-issued URL remains usable until expiry; previously downloaded copies cannot be revoked. Production has no anonymous Storage reads.
- `paperbridgeUploadManuscript` accepts raw PDFs up to 20 MiB only after revoked-token and tenant checks. It holds an account lease, checks manuscript ownership, generates an immutable server-selected path, and creates the object with a generation precondition. Direct client Storage reads, creates, overwrites and deletes are denied.
- Provider keys are encrypted as described in `docs/ai.md`. Exports include the user's content and AI settings/history, never provider credentials or another user's private annotations.
- Deletion disables the Auth account, revokes refresh tokens and writes a permanent tombstone. Each running API/AI operation holds a transactionally registered lease, so deletion waits before purging and new operations cannot recreate data. An hourly job resumes incomplete deletions. Requests needed by the other participant retain an anonymized status record; deleted-account manuscript text, messages, keys, notes, feed posts and storage objects are removed.

## Deployment prerequisites

1. A billing-enabled Firebase project with a dedicated Auth tenant, named Firestore database, private bucket and runtime service account. See isolated runtime configuration below.
2. Deploy `firestore.rules` and `firestore.indexes.json` to only the named database. `storage.rules` denies all direct client access when a Firebase Storage bucket is used. Production may use a dedicated private GCS bucket with uniform IAM access instead; never apply PaperBridge rules to another app's bucket.
3. The runtime service account needs signing permission (`iam.serviceAccounts.signBlob`, typically Service Account Token Creator on that service account) to mint PDF URLs. Configure bucket CORS for the hosting origin and `GET`, `HEAD` using `docs/storage-cors.json`: `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=docs/storage-cors.json`. Update its explicit origins if the hosting domain changes; no wildcard origin is needed.
4. Store `PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY` (32 random bytes encoded as base64) and `PAPERBRIDGE_SMTP_PASSWORD` in Firebase Secret Manager. Do not commit them or embed them in the SPA.
5. Configure non-secret function environment values `APP_URL`, `SMTP_HOST`, `SMTP_PORT` (465 default, implicit TLS; other ports require STARTTLS), `SMTP_USER`, and `EMAIL_FROM`. APP_URL defaults to `https://paperbridge.web.app`.
6. Verify real SMTP delivery with the site's configured verified sender. No SMTP credentials are supplied in this repository, so production inbox delivery cannot be asserted from repository tests.

Email submission is durable: the same transaction that creates a request creates notifications and two outbox records. Creation and a 15-minute retry job process the queue with leases, exponential backoff and an eight-attempt cap. Missing SMTP configuration leaves mail queued with a visible reason. `sent` means accepted by the SMTP provider, not verified arrival in an inbox. Delivery is at-least-once; stable Message-IDs reduce duplicate presentation, but a worker crash after SMTP acceptance can cause a duplicate. Failed jobs require administrator investigation and an explicit requeue after fixing the provider.

The `reports` collection contains privately submitted moderation reports with `status: open`. Moderation requires a trusted administrator operating through server-side tools or Firebase Console; clients cannot read or alter reports.

## Tests

From the repository root:

```sh
npm --prefix functions ci
npm --prefix functions test
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npx firebase emulators:start --only auth,firestore,storage --project demo-paperbridge
```

In a separate shell:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
GCLOUD_PROJECT=demo-paperbridge \
npm --prefix functions run test:integration
```

The integration suite refuses to run without emulators. Its application test clears the **demo-paperbridge emulator database**, never a production database. Tests cover concurrent capacity and duplicates, private/revoked/public annotation access, real Storage uploads and rules, status roles, social/chat blocking, latest-record selection beyond page limits, email delivery leases/retries/redaction, and in-flight account deletion. Provider transport calls in emulator tests are mocked; separately recorded live provider checks are documented in `docs/ai.md`.

Bounded list responses return the newest records: feed 100, conversations 100, request/message history 500, comments 300, directory 200. The current client does not expose older-message pagination. Rate limits are per account/action/minute; API leases and rate-limit records add Firestore operations per call. Rate-limit records use a TTL policy. Billing budgets, operational alerts, App Check enforcement and moderator staffing are project-owner operational settings, not evidence of completed configuration.

## Manuscript revisions

`paper.save` creates revision 1 for a new manuscript. For existing manuscripts, changing the PDF storage path or extracted text increments `version`; metadata-only edits retain the version. Pass `expectedVersion` (inside `paper` or at the top level) to reject a stale replacement instead of silently overwriting another save. The category cannot change while any endorsement request is active.

`versions` contains the latest twenty metadata records `{version, storagePath, fileName, updatedAt, title}`, including the current revision. Prior PDF objects are retained in the author's private paper folder until manuscript/account deletion. Server uploads are create-only: every replacement receives a fresh UUID object name. Active requests retain their original title and gain `paperVersion`, `currentPaperTitle`, `paperUpdatedAt`, and `revisionAvailable`; reviewers receive an in-app notification when content changes. This does not change request status or send an email.

`paper.version.get {id, version}` authorizes the owner or an active reviewer even when the current manuscript is public. It returns the paper with the selected revision's file/title/date metadata, a short-lived PDF URL, `currentVersion`, and the available history. Other manuscript metadata is current; extracted text is returned only for the current revision because historic extracted text is not retained. Revisions outside the twenty-entry history return `not-found`.

Annotations persist `paperVersion` and list responses normalize older notes without that field to version 1. Pass `paperVersion` when creating a note; a stale value is rejected transactionally. Previous-revision notes remain readable as archived notes, but cannot be moved to a new revision by editing. The reader must overlay only notes matching the selected PDF revision and disable new notes when viewing an archived PDF.

`functions/test/revisions.integration.cjs` is a nondestructive emulator suite covering revision notifications, category locking, stale and concurrent saves, annotation version binding, private archived downloads, history limits, and Storage overwrite denial.

## Bounded list responses

`paper.list` returns manuscript metadata plus `textCharacterCount` and omits extracted `text` and the `versions` history. The count is computed from existing documents, so manuscripts saved before this optimization need no migration. Fetch `paper.get` for the selected manuscript when full extracted text or history is needed.

`ai.jobs` projects only `id`, `ownerId`, `paperId`, `title`, `status`, `createdAt`, and `updatedAt`. Findings, quotations, prompts/configuration, consent, errors and other report bodies are returned only by owner-authorized `ai.job.get`. These bounded summaries keep library/history responses small and avoid repeatedly transferring private manuscript and report bodies.

## Isolated runtime configuration

All functions use `PAPERBRIDGE_DATABASE_ID`, `PAPERBRIDGE_AUTH_TENANT_ID`, `PAPERBRIDGE_STORAGE_BUCKET`, and `PAPERBRIDGE_SERVICE_ACCOUNT`. Production must set these explicitly. A missing database, tenant or bucket fails closed; the production database cannot be `(default)`. The only default-resource fallback is local emulator use (Auth and Storage additionally require a `demo-` project). Never remove tenant configuration to work around sign-in problems.

The callable rejects missing or mismatched `firebase.tenant` claims before reading Firestore, registering leases or counting requests. Auth administrative operations, including disable/revoke/delete, use the configured tenant's Admin Auth instance. The email trigger targets the configured named database. Restrict the dedicated service account's IAM to that database, tenant and bucket, its own signing permission, and the two namespaced secrets.

Exports are `paperbridgeApi`, `paperbridgeUploadManuscript`, `paperbridgeSendQueuedEmail`, `paperbridgeRetryQueuedEmail`, and `paperbridgeRetryAccountDeletion`. Use the `paperbridge` Functions codebase in the shared production project. Local emulators use the same function names. The namespaced Secret Manager values are `PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY` and `PAPERBRIDGE_SMTP_PASSWORD`; generic secret names are not production fallbacks.

`functions/test/runtime.integration.cjs` proves mismatched/default tenant tokens cannot create leases, rate limits, deletion records or modify a parent-project sentinel; a valid tenant reads only its named database. It also checks tenant-specific Admin Auth, explicit bucket selection and missing-production-configuration rejection.

## SMTP safeguards and free-tier setup

Each send reserves one attempt transactionally against UTC hourly, daily and calendar-month budgets. Defaults are 50/hour, 250/day and 7,000/month; configure `EMAIL_HOURLY_LIMIT`, `EMAIL_DAILY_LIMIT`, and `EMAIL_MONTHLY_LIMIT` for the selected provider. Zero pauses that window. Excess mail stays queued until reset and does not consume an attempt. Actual send attempts, including retries and failed connections, consume the conservative local allowance. Missing credentials do not. Each message stops before a ninth attempt. These limits cover this app's outbox, not another app sharing a provider account. Provider quotas and reset clocks can differ.

SMTP errors persist only allowlisted error codes and bounded numeric status codes; raw responses and credentials are never saved. TLS is mandatory. `EMAIL_REPLY_TO` can direct responses to the support inbox. A provider accepting mail does not prove final delivery: review its transactional logs and verify an actual recipient inbox during release. See [free email setup](email-setup.md) for provider prerequisites.

## Profile and community media

`paperbridgeUploadMedia` accepts an authenticated raw-file POST with `purpose=avatar|community` and `fileName`. It checks a non-revoked tenant token and holds the same account-deletion lease as other mutations. Avatar inputs are JPEG/PNG/WebP up to 5 MiB, community images up to 8 MiB, and community PDFs up to 20 MiB. Images are fully decoded with a 20-megapixel ceiling and rebuilt as metadata-free, single-frame WebP: avatars are 512×512; community images fit within 2048×2048. SVG and animated formats are rejected. PDFs are header/EOF-checked untrusted attachments, served with download disposition; this is not malware scanning or a guarantee about embedded PDF content.

The response is `{data:{id,purpose,kind,fileName,size,contentType,width,height,url,expiresAt}}`. It does not expose the bucket path. The endpoint allows 12 uploads/minute and reserves a daily allowance of 40 files/100 MiB before image decoding. Failed attempts can consume this conservative allowance. Owner-only drafts expire after 24 hours. `media.remove {id}` deletes an unclaimed owner draft. `paperbridgeCleanupMedia` runs hourly, purges up to 200 expired/failed/detached objects, and retains retryable deletion records when object deletion fails.

`profile.save` accepts `profile.avatarId`; omission preserves the current photo and null removes it. Profile, directory and chat DTOs include authorized avatar URLs. `feed.post`/`feed.edit` accept up to four `mediaIds` and `postType` (`update`, `question`, `paper`, `milestone`). Edits preserve omitted properties. The claim transaction validates ownership, purpose and exclusive use. Replacing a photo, removing an attachment, or deleting a post marks the old object for deletion atomically and attempts immediate cleanup. Public community attachments use their own upload objects; linking a private manuscript is rejected.

`media.get {id}` refreshes a read URL after checking the current profile/post reference, visibility and both directions of blocking. Drafts are owner-only, private-post attachments are author-only, and private-profile photos are hidden from other accounts. Production URLs expire after ten minutes; an issued URL cannot be revoked immediately when visibility changes, and downloaded copies cannot be recalled. Production objects have no Firebase download tokens. Local emulators reuse an emulator-only token so repeated reads do not invalidate an already rendered image.

Post DTOs include `attachments`, `authorAvatarUrl`, `saved` and `liked`. `feed.save {id}` toggles a private bookmark (500 maximum). `feed.list {saved:true}` shows up to the newest 100 bookmarked records, then filters current post access; `authorId` selects recent posts from one author. Saved/following/author filters are mutually exclusive. Account export includes owned media metadata and bookmarks without signed URLs. Account deletion removes media records, quota state, bookmark records and the account's bucket prefix.

## Request-scoped PDF note threads

`annotation.list/save` accept `requestId`. Scoped shared notes are visible only within that request's author/reviewer pair. A reader without request context never receives another user's scoped notes, even when reviewing the same manuscript through a different request. Private notes remain author-only. Existing unscoped shared notes retain their earlier manuscript-sharing semantics. Request context includes that request's visible notes plus the caller's unscoped private notes.

`annotation.reply {id,body}` appends a signed-in author/name/date record (5,000 characters, 50 replies maximum); `annotation.resolve {id,resolved}` records or clears resolution author/name/date. Both participants may operate on current-version shared notes while the exact request remains active. Private-note operations require the author. Closed requests and archived PDF revisions reject edits, replies and resolution changes; the note's author can still delete it. Editing preserves replies and resolution state and cannot change the request scope. Account export includes the caller's own replies to others' notes; erasure removes those replies and anonymizes resolution attribution.

`request.get` adds `requesterAvatarUrl` and `reviewerAvatarUrl`; request-message and feed-comment DTOs add `authorAvatarUrl`. All respect current photo visibility/blocking.

## PDF extraction observations

`paper.save` accepts validated `pdfAnalysis` version 1 with total/scanned pages, extracted-character count, truncation and up to 100 sequential per-page observations. Numbers must be finite and bounded; bounds may extend outside the page to describe clipping. These browser observations are advisory, not verified measurements. Full paper/revision responses retain page geometry; list responses expose only coverage/count fields. Replacing text/PDF without new observations clears stale metrics. Historical revisions keep their own observations and never inherit current geometry.
