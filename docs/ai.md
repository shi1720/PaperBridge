# Private manuscript review with your own API keys

PaperBridge runs five specialists and one synthesis: Evidence lens (`evidence`), Attribution lens (`originality`), Methods & robustness (`reviewer`), Formatting & structure (`formatting`), Submission readiness (`readiness`), then a prioritized revision plan (`synthesis`). Each specialist has its own provider/model configuration. Synthesis uses the Methods & robustness configuration, including reasoning effort. These are research assistance, not endorsement decisions, plagiarism scans, scientific certification, or visual PDF inspection.

## Model configuration

The recommended configuration is OpenAI `gpt-6-astra` with `reasoningEffort: "medium"`. The UI only enables its preset when the exact model is returned by the connected account's current catalog; applying the preset still requires Save model choices. Existing configurations are not silently changed. Users must configure the new formatting and readiness specialists before a new review can start.

Astra uses the Responses API with `reasoning: { effort }`, strict JSON-schema output, `store: false`, and a 12,000-token output budget that includes reasoning. Supported Astra effort values are low, medium, high, xhigh, and max. Medium is persisted when an Astra configuration omits effort. Unsupported model/effort combinations fail validation; there is no fallback model. Explicit effort controls are currently limited to verified Astra IDs and dated snapshots. Other available models use provider-default reasoning. OpenAI reasoning families receive the larger output budget even when effort is provider default. Anthropic and Gemini retain their native request formats with a 6,000-token output cap.

Available models are fetched from the user's provider account and checked again when saving choices. Some returned catalog models can still reject a request because of account permissions or generation capabilities; that stage fails visibly. The server does not change a model to complete the review. API key validation and provider calls use fixed provider endpoints and controlled errors that never echo response bodies.

Official model guidance checked on 2026-09-21: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Astra migration and reasoning guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra). Astra supports text/image input, but this implementation sends extracted text and PDF metrics, not images.

## Review scope and PDF diagnostics

New reviews default to `coverageMode: "full"`: every stored extracted character is supplied, up to 100,000 characters. Oversize input is rejected before provider calls rather than silently truncated. Known source truncation (`pdfAnalysis.textTruncated`) or unscanned pages block full mode. Users can explicitly choose `coverageMode: "partial"`, which supplies only the first 32,000 stored characters; the saved scope records reviewed/total characters and source-page coverage. Reusing an idempotency key with different coverage is rejected.

Legacy manuscripts without PDF metrics can review their full stored extracted text, but source-PDF coverage is recorded as unknown. “Full extracted text” never means complete visual or scientific inspection. PDF extraction may omit scans, diagrams, math, tables, and layout. All pages being scanned does not prove all content was extracted. Sparse-page warnings direct the researcher to inspect source pages.

`paper.pdfAnalysis` is a validated version-1 observation produced by PDF.js: total/scanned page counts, extracted character count, truncation status, and up to 100 page measurements (`page`, `width`, `height`, `textCharacters`, `minFontSize`, `medianFontSize`, `textBounds`). These are client-reported extraction measurements, not an attestation. AI processing derives separate deterministic warnings for incomplete extraction, fewer than 80 text characters on a page, median font size below 8 PDF points, and text bounds more than 2 points outside a page. Heuristics can have false positives and are not venue-format rules. No warning-free or empty-finding report certifies readiness. The formatting specialist checks extracted structure, citations, captions, notation and cross-references and is explicitly prohibited from claiming visual inspection.

## Bounded orchestration, consent and billing

Five independent specialists run with concurrency three; synthesis starts after they finish. Every successful stage is persisted immediately using separate Firestore fields, so concurrent writes cannot replace another stage. Stage status records distinguish pending, running, completed, failed and skipped. Synthesis receives the successful results and stage errors. If every specialist fails, synthesis is skipped without another paid call. Partial results remain available when any later stage fails.

Each provider request has a 140-second limit; the job has a 460-second budget within the callable's 540-second ceiling. There are at most six generation calls, no automatic paid retries, one active job per account, and ten started reviews per UTC day. OpenAI reasoning models cap output at 12,000 tokens per call; other calls cap at 6,000. Limits bound work, not dollars. Multiple specialists receive the same manuscript; repeated input and reasoning can be expensive. Provider pricing, usage charges, retention and regional policies apply. Failed or timed-out requests can still incur charges. Provider-reported usage, including OpenAI reasoning tokens when returned, is saved per stage.

Only manuscript owners can start reviews. Every run requires explicit consent and an explicit Crossref lookup choice. Providers receive extracted text, title, PDF metrics, optional bibliographic metadata and (for synthesis) prior findings. Crossref receives at most six cited DOIs and the title only when enabled. It is a fixed, audited metadata lookup, not autonomous browsing or full-text literature search. Retrieved records can identify publications but cannot verify the claims in them. Manuscript URLs are never fetched.

Jobs use a client-generated request ID, deterministic owner-bound job ID and transactional lease. Retrying the same request returns the existing job; it does not create another billed review. The UI polls stage progress and offers completed report downloads as Markdown or JSON. Markdown includes the revision plan, specialist findings, exact quoted passages, next steps, failures, reasoning settings, coverage and diagnostics. JSON preserves the saved audit. A server interruption cannot guarantee completion; jobs still running after ten minutes are marked interrupted and retain their partial results.

## Grounding and review quality

All manuscript text, metrics, bibliographic metadata and prior model outputs are untrusted data, never instructions. Prompts distinguish assessable concerns from established errors and require concrete revisions or minimal experiments, ordered by severity. Specialists adapt to study type rather than imposing experimental conventions on theoretical work. Synthesis reconciles duplicated findings and disagreements without issuing an accept/reject verdict.

The server validates structured results, accepts up to ten findings per stage, requires each quotation to match the reviewed manuscript (allowing layout whitespace and a single presentation-quote wrapper), and accepts external source IDs only from retrieved metadata. Unsupported quotations or sources are discarded with a visible limitation. Findings are ordered high, medium, then low severity. Grounded quotations prove provenance, not the truth of a model's explanation. Empty findings do not establish correctness, originality or endorsement eligibility.

## Key storage and setup

The callable needs `PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY`, a secret containing a cryptographically random 32-byte value encoded as base64. Keys are validated before storage and encrypted with AES-256-GCM and authenticated owner/provider binding. Direct client reads of key documents are forbidden. Keys are never returned to the browser or account export. Operators with server credentials and the encryption secret can decrypt them; encryption does not remove this trust boundary. Rotation requires re-encrypting existing keys; replacing the secret alone makes them unreadable. Users can remove or replace keys.

## Callable contract

Every operation is authenticated. Responses remain wrapped as `{data: result}`.

- `ai.settings`: agents, connected provider metadata and limits. Never key material.
- `ai.key.save {provider,key}` / `ai.key.delete {provider}`: validate/store or remove a provider credential.
- `ai.models {provider}`: current permitted model catalog and fetch time.
- `ai.configure {agents}`: all five specialists, each `{provider,model,reasoningEffort?}`.
- `ai.review {paperId,consent:true,allowMetadataLookup:boolean,coverageMode?:"full"|"partial",requestId}`: start or retrieve one idempotent review.
- `ai.jobs {paperId?}`: bounded metadata history; `ai.job.get {id}`: complete owner-only report.

Jobs include scope, PDF diagnostics, stage progress, budget, consent, configuration, manuscript hash/version timestamp, prompt version, metadata audit, results and sanitized errors. Existing reports remain readable even when they contain only the original three specialists.

## Expanded-pipeline verification

Backend unit tests cover Astra reasoning/schema requests, usage extraction, unsupported effort rejection, quote/source grounding, full/partial coverage, deterministic PDF diagnostics, bounded concurrency and other provider contracts. Frontend tests cover five specialists, extraction blockers, stage failures/progress and report export. Firestore integration exercises six persisted stages, idempotency, privacy, partial failures, daily caps, and pre-charge rejection of incomplete full scans.

An authorized direct-provider check of the expanded pipeline completed on 2026-09-21 with exact-catalog `gpt-6-astra` and medium reasoning. All six stages succeeded: Evidence 8 accepted findings, Attribution 3, Methods & robustness 6, Formatting & structure 5, Submission readiness 8, and Synthesis 7. All accepted findings passed quotation/source grounding. This validates the real provider adapter and prompts; it does not replace deployed callable, account, or browser end-to-end verification. No credentials are included in this record. The Firestore emulator suite separately passed all four AI integration tests.

The historical four-stage checks below predate this expansion and are not evidence of six-stage Astra production behavior.

## Historical four-stage verification

Run `npm --prefix functions test` for encryption tamper/owner-binding tests, output grounding, truncation, network opt-out, fixed-host lookup, safe error mapping, adapter request constraints and prompt constraints. `scripts/ai-smoke.cjs` now executes all six live OpenAI stages against a short deliberately flawed manuscript with an embedded prompt-injection attempt; the results described in this historical section came from its earlier four-stage version. It reads an API key from `OPENAI_API_KEY` or, only for an authorized private fixture, `AI_TEST_OBJECTIVE`. It never writes the credential. The live check incurs provider charges; it is not part of automatic tests. Anthropic/Gemini live checks require separately authorized keys.

Implementation references checked on 2026-09-21: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [OpenAI model catalog](https://developers.openai.com/api/reference/resources/models/methods/list), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages), [Anthropic model catalog](https://platform.claude.com/docs/en/api/models), [Gemini generation](https://ai.google.dev/api/generate-content), [Gemini models](https://ai.google.dev/api/models), [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).

Live verification completed: all four OpenAI stages passed using dynamically discovered `gpt-5.4-mini`; each returned six accepted, exact-quotation findings on a small flawed observational manuscript. An embedded request to certify plagiarism-free/endorsed was ignored. JSON-mode input compatibility was fixed during this live check. No Anthropic or Gemini key was supplied; their adapters are covered by request/response contract tests, not a live-account claim.

Firestore emulator verification passed: owner/consent enforcement, encrypted key storage and redacted settings, four persisted stages, concurrent idempotency with exactly four provider calls, account isolation, ten-run daily limit, key deletion, and partial-failure audit/lease release. Live Crossref DOI and title queries also succeeded.

## Live UI integration verification (2026-09-21)

An opt-in `scripts/live-ui-smoke.cjs` now exercises a separate verified test account at `http://localhost:5174`, backed by local Firebase Auth/Firestore/Functions emulators and the real OpenAI API. It disables traces, screenshots, network logging and persisted browser state. It reads the authorized key only in memory, checks ciphertext storage and absence from browser local/session storage, and deletes its own key/account/manuscript/job fixtures afterward. It refuses a nonlocal URL or a frontend that does not explicitly point to the `demo-paperbridge` emulators. It is not part of CI and incurs real provider charges.

The final live run passed the complete script: UI sign-in, password-field key entry and immediate clearing, encrypted key storage, dynamic model discovery and all three saved selections, private manuscript selection, per-run consent, metadata opt-out, all four persisted stages, rendered stage tabs/quotes/empty-finding caution, provider-resolved model and token usage, lookup audit, consent reset, key removal through the UI, and administrative fixture cleanup. The requested `gpt-5.4-mini` resolved to `gpt-5.4-mini-2026-03-17`. The job completed without provider errors and retained 5 evidence, 0 attribution, 5 reviewer and 6 synthesis findings. See the [credential-free verification record](live-openai-verification.json).

The attribution stage's findings were rejected because they cited unavailable sources. Evidence and reviewer stages also each disclosed a quotation validation exclusion. These guardrails preserve provenance; they do not establish scientific accuracy. The UI explicitly cautions that no accepted findings does not establish correctness or originality. Earlier runs had incomplete test assertions and ambiguous zero-finding counts; the final run records per-stage limitations before cleanup. The failed model-label assertion was corrected to expect the provider-resolved model rather than its requested alias. No production Firebase validation is implied by this local-emulator/live-provider success.

The exercise identified and fixed accessible labels for provider/model/manuscript selectors. ReviewStudio also now uses `paper.list`'s `textCharacterCount` summary, preserving private manuscript text minimization. Five AI UI regression tests pass. No Anthropic or Gemini live-account validation is implied.

## Expanded production acceptance

The deployed six-stage callable completed on 2026-09-21 with `gpt-6-astra` and medium reasoning in every stage: Evidence 7, Attribution 3, Methods & robustness 8, Formatting & structure 4, Submission readiness 9, and Synthesis 9 accepted findings, with no provider errors. The complete 851-character controlled manuscript was supplied. The hosted browser rendered all six completed stages and exported the revision plan; desktop and mobile accessibility checks passed. See the [production acceptance record](live-revamp-verification.json), which also covers media, request-scoped collaboration and notification delivery acceptance. This is a controlled functional check, not evidence of scientific accuracy or a substitute for researcher review.
