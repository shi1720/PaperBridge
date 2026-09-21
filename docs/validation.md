# Validation record — 2026-09-21

The current release is a labeled preview at [paperbridge.web.app](https://paperbridge.web.app). Production operations remain gated pending billing activation, backend provisioning, and real SMTP inbox validation.

## Automatic checks

`npm run test:full` passed with Node 22 and Java 21 against the isolated `demo-paperbridge` Firebase emulators, with Auth, Functions, Firestore and Storage running together:

- 5 frontend AI rendering/contract tests.
- 19 backend unit tests for domain rules, encryption, provider adapters, grounding, consent and input boundaries.
- 30 backend integration tests for access control, request transitions/capacity, email queue retries, private data projections, revision history, immutable PDF objects, deletion and AI job isolation/idempotency.
- 6 Playwright browser checks: two-account registration and verification, private PDF rendering/notes/revisions, endorsement conversation and withdrawal/revoked reviewer access, fictional community journeys, follow persistence/consent reset, mobile overflow, and accessibility.

The accessibility checks cover 11 loaded routes at 1440px and 390px with zero serious/critical axe findings. This is automated evidence, not a claim of complete accessibility conformance. TypeScript and production build pass. Both production dependency audits report zero known vulnerabilities.

## Live checks and limits

The hosted preview passes an HTTPS browser smoke for security headers, visible preview labeling, direct route navigation, actual PDF rendering, and no observed runtime errors.

An authorized live OpenAI pipeline passed all four stages with grounded quotations. A separate live browser-to-callable exercise passed BYOK entry, encrypted storage, dynamic model selection, saved configuration, explicit consent, and four persisted stages without provider errors. The final full live UI smoke also passed result tabs, grounded quotations, empty-finding cautions, provider-resolved model/usage, metadata audit, consent reset, and key removal. Rejected attribution findings and other validation limits are retained in the credential-free live verification record. See [AI verification](ai.md) for precise outcomes and the opt-in reproduction script. No Anthropic or Gemini live credentials were supplied. Paid tests are excluded from CI.

Email transport is tested with a mocked SMTP transport and real Firestore transactions; actual inbox delivery is untested. Real production Auth, Storage signing/CORS, Functions and TTL provisioning cannot be verified until the billing quota is resolved. Scheduled retry handlers require production scheduler verification. User research was simulated by review agents, not conducted with recruited participants; see [product review](product-review.md).

## Release decision

Keep the implementation in a draft pull request until [deployment prerequisites and production smoke checks](deployment.md) pass. Do not enable real account creation or merge as a completed production release while those gates remain unresolved.
