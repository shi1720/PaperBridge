# PaperBridge

A private-first research collaboration workspace for independent researchers and arXiv endorsers. Built with React/TypeScript and Firebase Authentication, Functions, Firestore, Storage, and Hosting.

## Release status

The production homepage explains endorsement requests, category filters, researcher profiles, private manuscript collaboration, specialist AI review and the researcher social network, with separate researcher and endorser entry points. Fictional profiles and the interactive fixture are excluded from production; local development retains a labeled demo.

[paperbridge.web.app](https://paperbridge.web.app) retains its original Hosting project. The backend is isolated in the owner's existing billed project, with a dedicated database, Auth tenant, bucket and runtime identity. Production email/password registration is enabled after live cloud checks and real Brevo SMTP delivery. Gmail received all six controlled messages: five in Inbox and one submission confirmation in Spam. See the [validation record](docs/validation.md) for verified outcomes.

## What is implemented

- Researcher and endorser onboarding, email/password and optional Google authentication, verification, recovery, public profiles, 155 canonical arXiv categories, self-attested eligibility, availability and capacity.
- Private PDF manuscripts, immutable revisions, searchable PDF reader with thumbnails, fit-width/focus controls, persistent highlights, filtered private/shared notes, threaded replies and resolution, and extraction/coverage diagnostics.
- Atomic endorsement requests with duplicate/capacity protection and a dedicated in-app collaboration workspace: stage tracking, manuscript and request-scoped shared notes, discussion, revisions and activity history. Reviewing/change-request/offer/decline/withdrawal states and author-reported arXiv completion remain explicit. Email provides notifications linking back into the workspace.
- Branded HTML/plain-text verification, password recovery and two-recipient review emails, with an embedded logo, durable SMTP outbox, retry/backoff and honest queued/sent/failed visibility.
- Community image/PDF posts, four post categories, edit/delete, saved reading lists, in-app attachment viewing, arXiv links, likes/comments, following, researcher profiles with photos, private chat, notifications, blocking and reporting. Authenticated media uploads are validated; images are decoded and re-encoded, file access is signed and temporary, and cleanup removes abandoned/replaced uploads.
- Encrypted per-user OpenAI/Anthropic/Gemini keys; dynamic model catalogs; five independently configured specialists for evidence, attribution, methods, formatting and submission readiness; GPT-6 Astra medium recommendation when available; full extracted-text or explicit partial coverage; synthesis and export, optional Crossref metadata tools, exact-quote grounding, source audit, explicit consent, usage limits, and safe retry IDs.
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

The browser suite covers genuine two-account sign-up, verified role setup, PDF upload/rendering, category matching, request/feedback/withdrawal and loss of reviewer access; demo UI journeys and mobile layout; AI result rendering; and accessibility checks. Provider network calls are mocked in the automatic suite. Separately authorized live OpenAI checks include six-stage GPT-6 Astra medium generation and earlier complete browser-to-callable BYOK verification; Anthropic/Gemini have adapter tests but no live key was supplied.

## Deployment

Follow [deployment.md](docs/deployment.md). Keep provider keys out of `.env` files and browser bundles. Firebase web config is public application configuration; server encryption and SMTP secrets belong in Secret Manager.

- `npm run deploy:hosting` publishes the public homepage and client without modifying backend resources.
- `npm run deploy` deploys the isolated backend and then the original Hosting site, each with an explicit project.
- Enable `VITE_SERVICE_READY=true` only after production Auth, Functions, Storage authorization, PDF signing/CORS, and real transactional email delivery are verified.
- Enable `VITE_GOOGLE_AUTH_ENABLED=true` only after the Google provider and OAuth domains are configured and tested.

## Architecture and limitations

[Validation record](docs/validation.md) · [API contract](docs/contract.md) · [Backend operations](docs/backend.md) · [AI design and verification](docs/ai.md) · [Simulated product study](docs/product-review.md)

The callable API is the only client entrypoint to Firestore. Direct client database access is denied. PDF URLs expire after ten minutes; a withdrawal prevents new links, but existing links survive until expiry and downloaded copies cannot be recalled. Notes created in a request workspace are scoped to that participant pair, with private notes restricted to their author. Earlier paper-wide shared annotations retain their original audience. Closing a request stops new reviewer access.

Current deliberate limits: no paid subscription checkout; moderation reports require an operator; histories return bounded newest records without older-message pagination; no OCR/full-text plagiarism corpus; AI is a bounded synchronous six-stage pipeline with saved partial results rather than a durable background queue. Production billing alerts, App Check enforcement, monitoring and a staffed support process are operator setup work. These are not represented as completed.

The repository is private. Development fixtures are fictional and are not production member records.
