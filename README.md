# PaperBridge

A private-first research collaboration workspace for independent researchers and arXiv endorsers. Built with React/TypeScript and Firebase Authentication, Functions, Firestore, Storage, and Hosting.

## Release status

The production homepage explains private manuscript review and endorsement connections, with separate researcher and endorser entry points. Fictional profiles and the interactive fixture are excluded from production; local development retains a labeled demo.

[paperbridge.web.app](https://paperbridge.web.app) retains its original Hosting project. The backend is isolated in the owner's existing billed project, with a dedicated database, Auth tenant, bucket and runtime identity. Production account entry remains gated until real SMTP delivery and cloud smoke checks pass. See the [validation record](docs/validation.md) for verified outcomes.

## What is implemented

- Researcher and endorser onboarding, email/password and optional Google authentication, verification, recovery, public profiles, 155 canonical arXiv categories, self-attested eligibility, availability and capacity.
- Private PDF manuscripts, revision history with immutable files and version-specific notes, PDF.js rendering, text selection and persistent highlights, page-aware private/shared notes, bounded text extraction.
- Atomic endorsement requests with duplicate/capacity protection, private conversations, reviewing/change-request/offer/decline/withdrawal states, and author-reported arXiv completion.
- Durable two-recipient email outbox, SMTP delivery worker, retry/backoff, and honest queued/sent/failed visibility.
- Community feed, arXiv links, likes, comments, following, private chat, blocking, reporting and reported-contribution rankings.
- Encrypted per-user OpenAI/Anthropic/Gemini keys; dynamic model catalogs; independently configured evidence, attribution and critical-reader agents; synthesis, optional Crossref metadata tools, exact-quote grounding, source audit, explicit consent, usage limits, and safe retry IDs.
- Account exports, provider-key removal, profile privacy and deletion with token revocation, in-flight operation leases, anonymization and retryable cleanup.
- Responsive layouts, keyboard-accessible dialogs, empty/error/loading states, CSP/security headers and automated browser/access-control tests.

PaperBridge coordinates connections. It does not grant arXiv endorsement, verify someone’s current arXiv privileges, perform peer review certification, or promise publication. Contribution counts are author-reported. Attribution review is not a comprehensive plagiarism scan.

## Local development

Requires Node 22 and Java 21 for Firebase emulators.

```sh
npm ci
npm --prefix functions ci
npm run dev
```

Open `http://localhost:5173/?demo=1` for the clearly labeled interactive demo. It uses in-memory state and a fictional PDF fixture. Refreshing resets demo data. Real account data is stored in Firebase, not browser storage.

For the real backend locally:

```sh
npm --prefix functions run build
node scripts/prepare-emulator.cjs
npx firebase emulators:start --only auth,firestore,storage,functions --project demo-paperbridge
```

Start Vite in another terminal with `VITE_FIREBASE_AUTH_TENANT_ID=` (empty), `VITE_USE_EMULATORS=true`, `VITE_FIREBASE_PROJECT_ID=demo-paperbridge`, `VITE_FIREBASE_STORAGE_BUCKET=demo-paperbridge.appspot.com`, and `VITE_FIREBASE_API_KEY=emulator-key`. Emulated verification emails are visible in the emulator output/UI. The tests verify email addresses through the Auth emulator only; there is no production verification bypass.

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:full
```

`test:full` starts an isolated demo Firebase suite, tests the backend, then starts two Vite servers and executes browser flows. Stop previously running emulators first to avoid port conflicts. The backend integration suite intentionally resets the **demo-paperbridge emulator database**, never a live project. Do not run it against a development session containing data you need.

The browser suite covers genuine two-account sign-up, verified role setup, PDF upload/rendering, category matching, request/feedback/withdrawal and loss of reviewer access; demo UI journeys and mobile layout; AI result rendering; and accessibility checks. Provider network calls are mocked in the automatic suite. Separately authorized four-stage live OpenAI and complete browser-to-callable BYOK tests passed using a dynamically discovered model; Anthropic/Gemini have adapter tests but no live key was supplied.

## Deployment

Follow [deployment.md](docs/deployment.md). Keep provider keys out of `.env` files and browser bundles. Firebase web config is public application configuration; server encryption and SMTP secrets belong in Secret Manager.

- `npm run deploy:hosting` publishes the public homepage and client without modifying backend resources.
- `npm run deploy` deploys the isolated backend and then the original Hosting site, each with an explicit project.
- Enable `VITE_SERVICE_READY=true` only after production Auth, Functions, Storage authorization, PDF signing/CORS, and real transactional email delivery are verified.
- Enable `VITE_GOOGLE_AUTH_ENABLED=true` only after the Google provider and OAuth domains are configured and tested.

## Architecture and limitations

[Validation record](docs/validation.md) · [API contract](docs/contract.md) · [Backend operations](docs/backend.md) · [AI design and verification](docs/ai.md) · [Simulated product study](docs/product-review.md)

The callable API is the only client entrypoint to Firestore. Direct client database access is denied. PDF URLs expire after ten minutes; a withdrawal prevents new links, but existing links survive until expiry and downloaded copies cannot be recalled. Shared notes are only visible to authors and active reviewers.

Current deliberate limits: no paid subscription checkout; moderation reports require an operator; histories return bounded newest records without older-message pagination; no OCR/full-text plagiarism corpus; AI is a bounded synchronous four-stage pipeline with saved partial results rather than a durable background queue. Production billing alerts, App Check enforcement, monitoring and a staffed support process are operator setup work. These are not represented as completed.

The repository is private. Development fixtures are fictional and are not production member records.
