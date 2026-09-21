# Validation record — 2026-09-21

The redesigned public homepage is deployed at [paperbridge.web.app](https://paperbridge.web.app), with fictional profiles and the demo removed from production. Account registration remains gated while final live service checks are completed. The backend now uses isolated resources in the owner's existing billed GCP project; the original new-project billing quota no longer blocks deployment.

## Automatic checks

Current regression passed with Node 22 and Java 21:

- 9 frontend tests, including actual Firebase deployment archive exclusion for both configs.
- 29 backend unit tests covering domain rules, cryptography, provider adapters, grounding, consent, email budgets and upload boundaries.
- 45 Auth/Firestore/Storage/Functions emulator integration tests, including tenant isolation, immutable authenticated HTTP uploads, direct-access denial, email retry limits and branded verification links.
- 11 browser checks across the full suite and focused runs. Both account roles receive a private branded verification outbox item, resend cooldown prevents duplicates, and the actual generated verification code is consumed through the Auth emulator before the real PDF/revision/request workflow. Public-home, signup-policy entry, mobile layout and production demo-query rejection also pass.

TypeScript and production builds pass. Both production dependency audits report zero known vulnerabilities. Automated accessibility checks found zero serious/critical axe findings across the reviewed desktop/mobile routes; this is not a claim of complete accessibility conformance.

The homepage underwent two independent critique passes and a substantial product-focused redesign. Its manuscript/annotation and AI-output illustrations are labeled and noninteractive, with no fictional members or invented testimonials. Layout checks passed at 320, 390, 768, 1024 and 1440 pixels. The deployed homepage passed remote HTTPS/security-header, direct-route and mobile-overflow checks, with zero observed runtime errors. Production query parameters cannot enable fictional content, and the fixture PDF is excluded from Hosting uploads.

## Live checks and limits

Named production Firestore rules, all 20 indexes, both TTL policies and all five backend functions are deployed. Two isolated tenant test accounts received real Firebase verification emails and successfully redeemed their codes. Live database reads, rate-limit writes and operation leases work. The live Auth permission issue was resolved by the documented tenant-scoped Editor role. Both profiles now round-trip correctly. A real PDF uploaded through the authenticated HTTP endpoint, saved to the named database, loaded through a signed URL with production CORS, and was denied to the other account. The live request flow, two notification queues, review state, private/shared annotations, conversation, export and withdrawal revocation also passed. Both scheduled handlers ran successfully. The named-database email event trigger processed a real branded verification job and deferred it accurately while SMTP was disabled.

An authorized live OpenAI pipeline passed all four stages with grounded quotations. A separate live browser-to-callable exercise passed BYOK entry, encrypted storage, dynamic model selection, saved configuration, explicit consent, and four persisted stages without provider errors. The final full live UI smoke also passed result tabs, grounded quotations, empty-finding cautions, provider-resolved model/usage, metadata audit, consent reset, and key removal. Rejected attribution findings and other validation limits are retained in the credential-free live verification record. See [AI verification](ai.md) for precise outcomes and the opt-in reproduction script. A further deployed-cloud OpenAI check passed key validation, encrypted storage, decryption, model discovery, saved configuration and all four review stages; the test key was then removed. See [production AI verification](live-production-ai-verification.json). No Anthropic or Gemini live credentials were supplied. Paid tests are excluded from CI.

Brevo Free signup and account validation are complete. SMTP credential creation awaits the browser-required approval; transport remains explicitly disabled during staging. The sender identity is verified. Request/review SMTP acceptance and final inbox delivery remain unverified until a real SMTP key is configured. User research was simulated by review agents, not conducted with recruited participants; see [product review](product-review.md).

## Release decision

Keep the implementation in a draft pull request until [deployment prerequisites and production smoke checks](deployment.md) pass. Do not enable real account creation or merge as a completed production release while those gates remain unresolved.
