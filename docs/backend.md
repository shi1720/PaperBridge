# Backend operation and verification

The callable `api` in `us-central1` is the only Firestore application entrypoint. Firebase Authentication is required for all actions. Participation (requests, status changes, discussions, likes, following, chat and reports) additionally requires a verified email. Direct Firestore access is denied. User emails, endorsement URLs, messages, manuscript text, notes and AI credentials are not exposed in the directory or feed.

`functions/src/api.ts` implements the contract in `docs/contract.md`. All timestamps are milliseconds. Returned documents include `id`. A missing own profile returns `null` for onboarding; another missing profile remains a `not-found` error. Categories are validated against the same 155 canonical IDs offered by the UI. New APIs beyond the original contract: `block.list` returns the caller's block records. `notifications.list` includes `emailStatus` and `emailIssue` when an email was queued; it never includes the recipient address. `account.delete` returns `{deleted,pending}`; if an operation was already running, pending deletion is completed automatically after it ends.

## Endorsement and privacy semantics

- Eligibility is self-attested via `eligibilitySelfAttested`; accepting requests requires an endorser role and at least one exact category. Pausing takes effect transactionally for new requests.
- A request transaction checks duplicate active requests, category, account blocks, public availability and weekly intake/open-request capacity. Weeks begin Monday at 00:00 UTC. Declining/withdrawing releases open capacity but does not erase that week's intake.
- `accepted` is an offer to help. Only the requester can report `endorsed` after acceptance. The leaderboard explicitly labels completions as author-reported; it is not verification by arXiv.
- A private manuscript is readable by its author and active reviewers. Withdrawal/decline removes new access immediately. Shared annotation access remains restricted to author/active reviewer even if the manuscript is public. Personal notes remain author-only.
- `paper.get` supplies a signed download URL valid for ten minutes. An already-issued URL remains usable until expiry; previously downloaded copies cannot be revoked. Production has no anonymous Storage reads.
- Storage uploads are restricted to the authenticated owner's path, PDF content type and files smaller than 25 MiB (the UI uses a 20 MiB limit). Account deletion tombstones reject new uploads.
- Provider keys are encrypted as described in `docs/ai.md`. Exports include the user's content and AI settings/history, never provider credentials or another user's private annotations.
- Deletion disables the Auth account, revokes refresh tokens and writes a permanent tombstone. Each running API/AI operation holds a transactionally registered lease, so deletion waits before purging and new operations cannot recreate data. An hourly job resumes incomplete deletions. Requests needed by the other participant retain an anonymized status record; deleted-account manuscript text, messages, keys, notes, feed posts and storage objects are removed.

## Deployment prerequisites

1. A Firebase project on a billing-enabled plan, enabled Auth providers and a Storage bucket.
2. Deploy `firestore.rules`, `firestore.indexes.json` and `storage.rules` alongside the functions. Storage rules use Firestore to check deletion tombstones; enable the cross-service permission requested by Firebase deployment.
3. The runtime service account needs signing permission (`iam.serviceAccounts.signBlob`, typically Service Account Token Creator on that service account) to mint PDF URLs. Configure bucket CORS for the hosting origin and `GET`, `HEAD` using `docs/storage-cors.json`: `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=docs/storage-cors.json`. Update its explicit origins if the hosting domain changes; no wildcard origin is needed.
4. Store `AI_KEY_ENCRYPTION_KEY` (32 random bytes encoded as base64) and `SMTP_PASSWORD` in Firebase Secret Manager. Do not commit them or embed them in the SPA.
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

`versions` contains the latest twenty metadata records `{version, storagePath, fileName, updatedAt, title}`, including the current revision. Prior PDF objects are retained in the author's private paper folder until manuscript/account deletion. Client uploads are create-only: every replacement must use a fresh filename. Active requests retain their original title and gain `paperVersion`, `currentPaperTitle`, `paperUpdatedAt`, and `revisionAvailable`; reviewers receive an in-app notification when content changes. This does not change request status or send an email.

`paper.version.get {id, version}` authorizes the owner or an active reviewer even when the current manuscript is public. It returns the paper with the selected revision's file/title/date metadata, a short-lived PDF URL, `currentVersion`, and the available history. Other manuscript metadata is current; extracted text is returned only for the current revision because historic extracted text is not retained. Revisions outside the twenty-entry history return `not-found`.

Annotations persist `paperVersion` and list responses normalize older notes without that field to version 1. Pass `paperVersion` when creating a note; a stale value is rejected transactionally. Previous-revision notes remain readable as archived notes, but cannot be moved to a new revision by editing. The reader must overlay only notes matching the selected PDF revision and disable new notes when viewing an archived PDF.

`functions/test/revisions.integration.cjs` is a nondestructive emulator suite covering revision notifications, category locking, stale and concurrent saves, annotation version binding, private archived downloads, history limits, and Storage overwrite denial.

## Bounded list responses

`paper.list` returns manuscript metadata plus `textCharacterCount` and omits extracted `text` and the `versions` history. The count is computed from existing documents, so manuscripts saved before this optimization need no migration. Fetch `paper.get` for the selected manuscript when full extracted text or history is needed.

`ai.jobs` projects only `id`, `ownerId`, `paperId`, `title`, `status`, `createdAt`, and `updatedAt`. Findings, quotations, prompts/configuration, consent, errors and other report bodies are returned only by owner-authorized `ai.job.get`. These bounded summaries keep library/history responses small and avoid repeatedly transferring private manuscript and report bodies.
