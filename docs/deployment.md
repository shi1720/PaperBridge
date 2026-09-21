# Deployment handoff

## Current facts

Created Firebase project: **paperbridge-research** (`417165033706`). Web app registered; native Firestore database created in `nam5`; deny-all client Firestore rules deployed successfully. The labeled interactive preview is deployed at [paperbridge.web.app](https://paperbridge.web.app). Its HTTPS response, security headers, direct route navigation, and rendered PDF have passed a remote browser smoke test.

Billing activation was attempted using the existing open billing account. Google returned `FAILED_PRECONDITION` with `Cloud billing quota exceeded`. No existing project was detached or modified to bypass this limit. `firebase deploy --only functions` independently confirmed the project cannot enable Cloud Build until Blaze is enabled. Auth API initialization and Firestore TTL provisioning are also blocked by billing. SMTP credentials were not supplied.

The preview builds with `VITE_SERVICE_READY=false`: the root opens a labeled fictional demo, account signup is gated, and no real manuscript or API key is accepted. Publishing this preview is not a claim that production backend operations are live.

## Unblock and configure

1. Increase the billing account’s project quota through [Google Cloud billing quota support](https://support.google.com/code/contact/billing_quota_increase), then enable [Blaze for this project](https://console.firebase.google.com/project/paperbridge-research/usage/details). Do not unlink other projects without the owner’s explicit instruction.
2. In Firebase Authentication, enable email/password. Configure an email template and authorized domains for the two Firebase hosting origins. Enable Google sign-in only if the corresponding web OAuth client is correctly configured; set `VITE_GOOGLE_AUTH_ENABLED=true` after verification.
3. Initialize the default Storage bucket. Use a US region compatible with Functions, or choose the organization’s data-residency requirements before launch. Update `VITE_FIREBASE_STORAGE_BUCKET` with the actual bucket name.
4. Configure a verified transactional SMTP sender. Put non-secret values from `functions/.env.example` in `functions/.env.paperbridge-research`. Store the SMTP password with `firebase functions:secrets:set SMTP_PASSWORD`; never use an unrelated user’s email credentials. No real inbox delivery has been claimed or tested yet.
5. Generate a random 32-byte base64 encryption secret directly to Secret Manager as `AI_KEY_ENCRYPTION_KEY`. Do not set the supplied test OpenAI key as a project secret: production AI is per-user BYOK. Preserve the encryption key across deployments; rotation requires migrating encrypted user keys.
6. Configure Storage CORS using `docs/storage-cors.json`. Grant the Functions runtime service account signing permission on itself (Service Account Token Creator, which includes `iam.serviceAccounts.signBlob`). Grant only the necessary Storage/database permissions. The Firebase CLI will request Firestore cross-service access for Storage rules.
7. Copy `.env.example` to `.env.local`, fill the public Firebase web config from the registered app, and keep `VITE_SERVICE_READY=false` during staging.

## Verify and release

```sh
npm ci
npm --prefix functions ci
npm run test:full
npm run build
npm --prefix functions run build
npx firebase deploy --only functions,firestore,storage,hosting --project paperbridge-research
```

The index file includes a TTL policy for rate-limit records. Verify indexes reach ready state before smoke testing. Enable budgets/alerts, review Functions max instances and quotas, configure App Check before enforcement, and establish a moderation/support owner. Those production controls have not been claimed as configured.

Use two new controlled test accounts, verify their emails through actual inbox links, and test:

- Researcher and endorser signup/login/recovery; exact category/availability/capacity.
- Private PDF upload and PDF.js rendering, including CORS/signing; private/shared annotations and cross-account rejection.
- Request creation produces both real transactional emails; inspect outbox states and actual recipient inboxes. Test retries with a transient failure.
- Review, comment, changes requested, revised manuscript, willingness to endorse, author-reported completion, decline and withdrawal; old signed URLs expire within ten minutes.
- Feed, follows, comments, chat, blocks, reports, export and account deletion.
- BYOK setup with an authorized key, live catalogs, a small review, persisted evidence/source/usage records, and key removal. The provided OpenAI key has already been used only for a bounded live pipeline check. Anthropic/Gemini live tests require their own authorized keys.
- Production CSP and direct navigation to every route; mobile and keyboard flows.

Only after these pass, rebuild with `VITE_SERVICE_READY=true` and deploy Hosting. Replace preview release notes with the actual production validation date and outcomes. Keep the demo separately accessible through `?demo=1` and clearly labeled.

## Email operations

`emailOutbox.status` is queued/processing/sent/failed. Sent means the SMTP server accepted the message, not proof of inbox delivery. Automatic retry is bounded; inspect `deliveryIssue` without logging secrets. A failed record can be requeued by a trusted operator after fixing the provider. See `docs/backend.md` for lease/backoff and at-least-once semantics.

## Rollback

Keep the previous Firebase Hosting version and Functions deployment available. If production verification fails, rebuild/deploy with `VITE_SERVICE_READY=false` to close new account flows while preserving the clearly labeled demo. Do not change security rules to public reads to work around a signing/configuration issue. Do not delete the encryption secret or user data during rollback.
