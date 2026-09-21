# Research experience audit — September 21, 2026

## Scope and release criteria

Inspect the public experience and researcher/endorser workflows; improve the frontend and backend together, preserve private manuscript access, and verify the release using the Firebase emulators, responsive browser checks, and production smoke checks. The repository must remain private. Never include provider credentials in artifacts.

## Independent review findings

- Social: chat list does not refresh for incoming conversations, unread state is missing, drafts disappear when switching conversations, and polling can disrupt reading. Following and liking do not produce activity notifications.
- Notifications: buried modal, no individual read operation, no unread filtering or recovery state.
- PDF: very small controls, crowded notes, lost drafts when navigating request tabs, note jumps do not reveal the passage, and revision loads can race.
- Requests: insufficient sending/error feedback and ambiguous closed-request access copy.
- Navigation: signed-in users land on a directory without a summary of their own manuscripts or next actions.

## Implemented changes

1. Added a role-aware workspace overview, meaningful page labels, direct upload entry, an accessible Activity destination, and three explicit homepage starting points.
2. Fixed cover/name spacing and mobile profile layout. Added searchable chat, unread counts, per-conversation drafts, keyboard sending, stable reading position, authoritative refresh, feed pagination and direct discussion links.
3. Enlarged PDF controls and notes, added edit-in-place and deliberate deletion, anchored highlight navigation, page filters and private drafts retained through navigation. Guarded revision races and clarified sending/error/closed-request states.
4. Added follow/like/shared-note activity, ownership-checked individual reads, complete batched mark-all, conversation read cutoffs and transactional block/deletion checks. Sparse feeds can continue through hidden records with bounded reads.

Subagent reviews simulate researcher and endorser perspectives. They are not a study with recruited human participants.

## Independent regression review

A second reviewer identified two regressions before release: merging chat snapshots retained server-deleted messages, and query changes could briefly display a previous error. Both were fixed. Chat snapshots are authoritative except for messages acknowledged during that request; hook state now carries its account/query scope as one value. Follow-up review confirmed both corrections. Additional checks corrected the optional arXiv-link copy and asynchronous discussion-link scrolling.

## Verification

- Frontend unit checks: 27 passed.
- Backend unit checks: 41 passed.
- Backend emulator integrations: final full pass 75 passed, including saved bookmarks beyond the first 100 and privacy-filtered cursor pages.
- Real OpenAI run: all five specialists and synthesis completed using GPT-6 Astra with medium reasoning. Every retained finding quoted the fictional manuscript exactly. Credential stayed in process memory. See [run record](live-experience-ai-verification.json).
- Production dependency audits: zero known vulnerabilities in both packages.
- Browser release run: 73 passed across Chromium and WebKit. The one production-only test skipped in that run passed separately against the built production preview. Coverage includes both account roles, verification and recovery, uploads/photos/media, requests, note editing/replies, social notifications/chat, accessibility, responsive controls and rotation.
- Final scoped activity/overview checks cover retained email delivery status in the new inbox.
- Live deployment outcomes are recorded in the release pull request. The opt-in `scripts/production-experience-smoke.cjs --run-live` checks two temporary tenant accounts, follows, notification ownership, unread chat cutoffs, signed PDF access, cross-account denial and blocking; cleanup removes only that run’s fixtures.

## Boundaries

Draft continuity is deliberately in memory; reloading the tab clears unsaved drafts. Saved notes and messages persist on the backend. AI tests use a fictional manuscript and do not establish scientific correctness; no live Anthropic/Gemini keys were available. PDF extraction still does not include OCR or comprehensive visual figure analysis. Chat history remains limited to the newest 500 messages. Moderation requires an operator, and billing, service monitoring and App Check enforcement remain operational work. No paid subscription flow was added. This release does not claim that all possible defects have been eliminated.
