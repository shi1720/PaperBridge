# Production deployment

PaperBridge retains [paperbridge.web.app](https://paperbridge.web.app) on Hosting project `paperbridge-research`. Its backend uses the owner's existing billed project `gen-lang-client-0444960702`; a new billing-project quota is unnecessary. Do not deploy the default local configuration wholesale to that shared project.

## Isolated resources

- Firestore database `paperbridge`, `us-central1`, deletion protection enabled. Direct client access is denied.
- Identity Platform tenant `PaperBridge-t4997`, email/password enabled. Every authenticated server entry point rejects other tenants before data access.
- Private GCS bucket `paperbridge-files-359201230061`, uniform bucket access and public access prevention. Authenticated HTTP upload validates tenant, ownership, size and PDF signature; generation-zero writes prevent replacement. Short-lived signed URLs authorize reading.
- Runtime identity `paperbridge-runtime@gen-lang-client-0444960702.iam.gserviceaccount.com`: database-scoped Firestore access, tenant-scoped Editor access for account administration, dedicated bucket object access, self-signing and access to its two secrets. Eventarc receiving is granted to this identity, and Cloud Run invocation is limited to its email worker and scheduled handlers.
- Functions codebase `paperbridge`, with five `paperbridge`-prefixed exports. Existing applications' functions and default databases are outside this deployment. Cloud Functions container artifacts expire after 30 days.
- Secret Manager: `PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY` and `PAPERBRIDGE_SMTP_PASSWORD`. Preserve the encryption secret across deployments; rotating it requires migrating encrypted BYOK records.

`firebase.production.json` deploys only the named database and PaperBridge functions. The GCS bucket is governed by private IAM; it does not use the parent project's Firebase Storage bucket. Local `storage.rules` also denies direct client access.

## Configuration and release

Copy `.env.example` into ignored `.env.local` and fill the registered Firebase web app's public config. Backend non-secret configuration belongs in ignored `functions/.env.gen-lang-client-0444960702`, using `functions/.env.example`. Secrets remain in Secret Manager. Firebase deployment archives explicitly exclude all `.env*`, `.secret*`, tests and local credentials.

```sh
npm ci
npm --prefix functions ci
npm run test:full
npm run deploy
```

`deploy` builds both packages, deploys the isolated backend with its explicit project/config, then deploys Hosting to its original project. `npm run deploy:hosting` updates only the website. These commands never deploy shared-project default Firestore rules.

Keep `VITE_SERVICE_READY=false` until production accounts, PDF upload/read permissions and real email inbox delivery pass verification. The public homepage remains available with honest setup status. Production builds exclude fictional demo accounts; `?demo=1` has no effect. Local Vite development retains the labeled fixture for development only. Enable Google sign-in only after separately configuring and testing the tenant provider.

## Verification

Check all indexes and rate-limit/email-budget TTL fields on database `paperbridge`. Test two controlled accounts through real email verification, role setup, private PDF rendering, review requests and inbox delivery. Validate both authorized collaboration and denied cross-account access, revision/revocation, export/deletion and encrypted BYOK settings. Record actual outcomes in `docs/validation.md`; SMTP acceptance alone does not establish inbox delivery.

## Email operations

Brevo Free provides the SMTP transport. The app caps attempts at 50/hour, 250/day and 7,000/month, below the provider's daily limit; deferred jobs resume after reset. Credentials and sender verification must finish before delivery is enabled. `emailOutbox.status` is queued/processing/sent/failed. `sent` means SMTP accepted the message. Delivery failures retry at most eight times, then require operator review. See `docs/backend.md` for leases and retry semantics.

## Rollback

Redeploy a previous Hosting version or build with `VITE_SERVICE_READY=false` to close account flows while retaining the public homepage. Preserve user data and encryption secrets. Never weaken rules or remove tenant isolation to bypass deployment or signing errors.
