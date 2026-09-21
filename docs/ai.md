# Private research review with your own API keys

PaperBridge offers Evidence audit, Attribution & positioning, Adversarial review, and a final synthesis. The first three have independently configurable providers and models; synthesis uses the reviewer's configuration. This is a bounded four-stage pipeline, not an autonomous browsing agent. Bibliographic lookup is a deterministic, audited tool preceding the model calls. Outputs are research assistance, never arXiv endorsements or plagiarism verdicts.

## Setup

Deploy the callable `api` with secret `AI_KEY_ENCRYPTION_KEY`, a cryptographically random 32-byte value encoded in base64. Generate directly into Firebase Secret Manager (do not commit or print it). The backend binds this secret; missing or invalid secrets fail closed. Keep production and emulator secrets separate. Keys are encrypted using AES-256-GCM, a fresh 96-bit nonce, and authenticated additional data binding the account and provider. Firestore `aiKeys` documents are inaccessible to direct clients. The backend decrypts only to call the selected provider. API keys are never returned, logged, embedded in frontend bundles, or exported. The Settings API returns provider names and modification dates only.

Secret rotation requires decrypting existing records with the prior secret and re-encrypting with the replacement before removing the prior version; changing the secret alone makes saved keys unreadable. Users can remove or replace keys. Operators with both server credentials and the encryption secret can decrypt credentials; encryption at rest does not eliminate that trust boundary.

Provider credentials must be connected first; connection checks `/models` before storage. Model catalogs are fetched from the user's provider, not an aging hard-coded list. Configuration validates selections against that catalog. Some catalog models may still reject a particular generation format or have account-level restrictions; those failures surface explicitly rather than falling back silently to a different billed model. Anthropic and Gemini catalogs paginate up to 500 records. OpenAI discovery excludes non-text specialties; Gemini requires `generateContent` support.

## Consent, privacy and limits

Only a manuscript's owner can start a run. Each run requires `consent: true` and an explicit boolean for Crossref metadata lookup. Consent records include timestamp, selected providers, metadata preference and consent version. The provider receives extracted manuscript text, title, bibliographic records when enabled, and (for reviewer/synthesis) previous review findings. Provider terms, retention, regional handling and billing apply to the user's account. OpenAI requests set `store: false`; this does not promise zero provider retention. No provider key is shared with another provider or Crossref.

When enabled, Crossref receives up to six cited DOIs and the manuscript title. Requests go only to the fixed `api.crossref.org` host and never follow manuscript URLs or redirects. Returned DOI links point to doi.org. This metadata can identify references but cannot verify a scientific claim, establish novelty, or detect plagiarism across publications. Title lookup is candidate discovery, not a confirmed match. Failed lookups are recorded and are not accusations of fabricated references.

Each review sends at most the first 32,000 manuscript characters per stage; truncation and reviewed/total counts are recorded. PDF extraction can omit visual evidence, equations and layout. No OCR or image reasoning is implied. Each of four calls caps generated output at 2,400 tokens, including provider reasoning where the provider defines the cap that way. Each provider request times out after 75 seconds; no automatic paid retries. One concurrent run per account and ten started runs per UTC day are enforced transactionally. These bound work, not dollars: selected model prices vary. Users should set provider spending limits. A failed stage can still incur provider charges.

Jobs use a client-supplied unique request ID for idempotency. Reusing it returns the existing job without starting another billed run. Configure the callable client timeout to 540 seconds. A disconnected client can retrieve the job later; UI retries should reuse the same ID. The backend persists each stage and marks partial/failed outcomes honestly. A stale running job is marked failed by `ai.job.get` after ten minutes. The user can intentionally create a new request ID to rerun. This synchronous implementation does not guarantee execution after a server termination; durable task queues are a future enhancement, and stale jobs are never presented as completed.

## Grounding and review quality

Each agent has a distinct task prompt. The reviewer challenges both the manuscript and earlier findings; synthesis reconciles issues without issuing acceptance decisions. Manuscripts, source records and prior model responses are labeled untrusted data. Models cannot issue network requests, write documents, contact people, or access credentials. The fixed Crossref tool runs outside model control.

The server validates structured JSON, caps findings, requires exact quotes present in the actual reviewed text, and accepts source IDs only from retrieved records. Findings with invented quotations or source IDs are discarded and disclosed in limitations. This verifies provenance, not the truth of model explanations. Review all recommendations manually. Originality review is specifically scoped to attribution and contribution framing, and must state that no full-text plagiarism corpus was searched.

## Callable contract

All responses are wrapped by `api` as `{data: result}`. All operations require authentication.

| Action          | Payload                                                                                       | Result                                          |
| --------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `ai.settings`   | none                                                                                          | `{agents, keys:[{provider,updatedAt}], limits}` |
| `ai.key.save`   | `{provider,key}`                                                                              | `{provider,connected,models}`                   |
| `ai.key.delete` | `{provider}`                                                                                  | `{deleted:true}`                                |
| `ai.models`     | `{provider}`                                                                                  | `{models:[{id,name}],fetchedAt}`                |
| `ai.configure`  | `{agents:{evidence:{provider,model},originality:{provider,model},reviewer:{provider,model}}}` | Settings                                        |
| `ai.review`     | `{paperId,consent:true,allowMetadataLookup:boolean,requestId}`                                | Job                                             |
| `ai.jobs`       | `{paperId?}`                                                                                  | Latest 100 owned jobs, newest first             |
| `ai.job.get`    | `{id}`                                                                                        | Owned job                                       |

A job records `id`, `ownerId`, `paperId`, `title`, `status` (`running/completed/partial/failed`), timestamps, `consent`, chosen `agents`, `scope` (`reviewedCharacters,totalCharacters,truncated`), `inputHash`, `paperUpdatedAt`, `promptVersion`, `metadata` (`sources,lookups,limitations`), `results`, and stage `errors`. Results keyed by `evidence/originality/reviewer/synthesis` contain `summary`, `findings`, `limitations`, provider, actual model and usage counts. Findings contain `title`, `severity`, `quote`, `explanation`, `recommendation`, `sourceIds`. Error messages are controlled generic strings; raw provider errors and bodies are never persisted.

## Verification

Run `npm --prefix functions test` for encryption tamper/owner-binding tests, output grounding, truncation, network opt-out, fixed-host lookup, safe error mapping, adapter request constraints and prompt constraints. `scripts/ai-smoke.cjs` executes all four live OpenAI stages against a short deliberately flawed manuscript with an embedded prompt-injection attempt. It reads an API key from `OPENAI_API_KEY` or, only for an authorized private fixture, `AI_TEST_OBJECTIVE`. It never writes the credential. The live check incurs provider charges; it is not part of automatic tests. Anthropic/Gemini live checks require separately authorized keys.

Implementation references checked on 2026-09-21: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [OpenAI model catalog](https://developers.openai.com/api/reference/resources/models/methods/list), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages), [Anthropic model catalog](https://platform.claude.com/docs/en/api/models), [Gemini generation](https://ai.google.dev/api/generate-content), [Gemini models](https://ai.google.dev/api/models), [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).

Live verification completed: all four OpenAI stages passed using dynamically discovered `gpt-5.4-mini`; each returned six accepted, exact-quotation findings on a small flawed observational manuscript. An embedded request to certify plagiarism-free/endorsed was ignored. JSON-mode input compatibility was fixed during this live check. No Anthropic or Gemini key was supplied; their adapters are covered by request/response contract tests, not a live-account claim.

Firestore emulator verification passed: owner/consent enforcement, encrypted key storage and redacted settings, four persisted stages, concurrent idempotency with exactly four provider calls, account isolation, ten-run daily limit, key deletion, and partial-failure audit/lease release. Live Crossref DOI and title queries also succeeded.

## Live UI integration verification (2026-09-21)

An opt-in `scripts/live-ui-smoke.cjs` now exercises a separate verified test account at `http://localhost:5174`, backed by local Firebase Auth/Firestore/Functions emulators and the real OpenAI API. It disables traces, screenshots, network logging and persisted browser state. It reads the authorized key only in memory, checks ciphertext storage and absence from browser local/session storage, and deletes its own key/account/manuscript/job fixtures afterward. It refuses a nonlocal URL or a frontend that does not explicitly point to the `demo-paperbridge` emulators. It is not part of CI and incurs real provider charges.

The live run verified UI sign-in, password-field key entry and immediate clearing, encrypted key storage, dynamic discovery of `gpt-5.4-mini`, saving all three agent choices, private manuscript selection, per-run consent, metadata opt-out, and execution/persistence of all four provider stages through the actual callable function. Jobs returned `completed` with no stage errors and the expected 451-character review scope. One run retained 5 evidence, 0 attribution, 5 reviewer, and 5 synthesis findings; later runs retained zero findings across all stages. **It was not established whether those zero counts reflected empty model findings or findings discarded by grounding validation**, because cleaned-up audit records were not retained with per-stage limitations in the diagnostic output. Do not interpret these counts as evidence of manuscript quality or label them a successful scientific assessment.

The final automated UI script did not complete all rendered-result/key-removal assertions. The expected model label has since been corrected to the provider-returned model identifier instead of the requested alias, but that correction has not been rerun against a paid provider. Therefore full live UI smoke success is **not claimed**. API keys and all identifiable test fixtures were removed administratively in the script's cleanup. Separate frontend regression tests cover synthesis, quotations, source links, stage errors, coverage, model usage, and the explicit empty-finding caution.

The exercise identified and fixed accessible labels for provider/model/manuscript selectors. ReviewStudio also now uses `paper.list`'s `textCharacterCount` summary, preserving private manuscript text minimization. Five AI UI regression tests pass. No Anthropic or Gemini live-account validation is implied.
