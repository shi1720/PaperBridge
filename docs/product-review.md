# PaperBridge product review

Reviewed 2026-09-21. This is a **simulated concept walkthrough**, not interviews, recruited-user testing, or empirical validation. The personas below are design probes; their reactions are hypotheses to validate with actual researchers. No user success rates or willingness-to-use claims are inferred.

## Product boundary

PaperBridge coordinates contact between authors and potential endorsers. Official endorsement is completed on arXiv. A PaperBridge offer, acceptance, or status change cannot verify an arXiv decision or guarantee manuscript acceptance. Suggested interface copy: “PaperBridge helps researchers connect. Endorsement is completed on arXiv and does not guarantee acceptance.”

## Simulated walkthrough

| Persona and task                                                                  | Likely friction                                                      | Design response and acceptance check                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent researcher: prepare a first request without institutional affiliation | Unclear eligibility, category selection, and next action             | Permit independent affiliation. Explain the personal-endorsement route. Author can save a draft, choose a canonical category, publish a complete request, and find its current status.                       |
| Busy endorser: find one relevant request and decide whether to help               | Long requests, unclear expectations, interruption burden             | Provide category filtering, concise abstracts and background, and availability controls. “Offer to help” and “Decline request” describe platform coordination without implying an official vote.             |
| Privacy-conscious author: share unpublished work with one prospective endorser    | Unclear public visibility, accidental exposure, inability to retract | Preview public fields before posting. Restrict manuscript and endorsement-link access. Public API responses omit confidential fields. The author can withdraw a request and understand what remains visible. |

## Priorities

### P0 — core trust and functional journeys

1. **Truthful workflow states.** Distinguish draft/open/in-conversation/closed/withdrawn platform states from any self-reported official result. Declining a PaperBridge request is not an arXiv negative vote. Do not show fabricated verification badges, outcomes, availability, messages, or endorsement integration.
2. **Complete author path.** Collect title, abstract, category, research background and contact preference. Preserve data on validation failure and show actionable errors. Allow draft saving before the official endorsement request exists; explain when its link is needed. Confirmation must identify the saved request and next step.
3. **Enforced confidentiality.** Restrict confidential materials server-side, not just by hiding controls. Public list/detail APIs must omit private email, unpublished draft URLs, and endorsement codes. Check ownership and authorized-recipient access. State clearly whether materials are public, restricted, or local-only.
4. **Honest identity and seed data.** Mark example profiles and requests as demo content. ORCID and publication claims do not prove current endorsement privileges. Use self-reported wording when no authoritative verification exists.

### P1 — usability, agency, and recovery

5. **Fast triage.** Search, category filters, request age, author context, visible availability and clear empty states. Preserve filters after reading details.
6. **Restrained outreach.** Make recipient selection intentional. Avoid bulk outreach and repeated unsolicited requests. A send action must deliver through a configured channel or explicitly save a draft. Provide decline and block/report paths where messaging is supported.
7. **Recoverable state.** Support edits and withdrawal, prevent duplicate accidental submission, and explain the consequences of reopening or closing. Keep enough activity history to explain changes without exposing private decisions.
8. **Accessible journeys.** Labeled controls, visible focus, keyboard-operable dialogs, readable contrast and announced status feedback. Essential actions must fit a phone viewport.

## Current policy grounding

- Since January 21, 2026, institutional email alone does not qualify a new author for automatic endorsement; prior authorship in the relevant endorsement domain is also required. Personal endorsement remains an alternative. [arXiv policy update](https://blog.arxiv.org/2026/01/21/attention-authors-updated-endorsement-policy/)
- Endorsement is not peer review. Manuscripts shared with prospective endorsers are confidential. arXiv discourages mass and repeated outreach. Official votes and comments are private; PaperBridge must not imply access to them. Official endorsement uses arXiv’s own form. [arXiv endorsement guidance](https://info.arxiv.org/help/endorsement.html)
- Current endorser status depends on qualifying recent arXiv authorship and is automatically determined, not inferred from career seniority or prestige. [arXiv eligibility guidance](https://arxiv-org.atlassian.net/wiki/spaces/AUS/pages/56033281/How+do+I+become+an+endorser)
- Category labels come from the current official taxonomy; categories should not be treated as a verified mapping of endorsement domains. `src/lib/categories.ts` contains 155 category IDs, names and groups fetched from this source on the review date. [arXiv category taxonomy](https://arxiv.org/category_taxonomy)

## Follow-up validation

Recruit independent authors and active endorsers for task-based testing. Observe category selection, comprehension of the arXiv handoff, confidence about manuscript visibility, and request triage. Do not treat this simulated review as proof of desirability, accessibility compliance, security, or production readiness. Those require separate evidence.

## Shared workspace and community revision

The subsequent review focused on three concrete gaps: email-centered follow-up, a limited PDF reader, and a community that could not carry research artifacts. The implemented changes keep each request's discussion, stage, manuscript versions and shared notes together; add PDF thumbnails, search, note replies and resolution; and support profile photos, community images/PDFs, post editing and saved discussions. The homepage describes these available workflows without fabricated researchers or outcomes.

Code review and controlled browser journeys exposed and corrected access races, expired image preview recovery, unsaved profile field loss during photo changes, and stage-label contrast. Two separate accounts now exercise sharing, private-note isolation, replies, revision history and withdrawal. These are implementation checks, not interviews or evidence of adoption. Formatting review covers extracted structure and measured PDF diagnostics; the product explicitly states that it does not inspect figures or visual layout.

## Activity and collaboration audit

A further independent agent code walkthrough used three simulated tasks: an author returning to a review reply, an endorser triaging several conversations, and a researcher following a colleague. These are design probes, not recruited-user interviews or measured user-study findings.

| Task                                 | Confirmed implementation gap                                                                                       | Implemented response and evidence                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Return to an unread conversation     | Chats had no unread state or read cutoff; opening a global notification view could clear unrelated alerts.         | Caller-specific unread counts and per-item notification reads; concurrent-send emulator tests preserve messages arriving after the rendered cutoff.        |
| Notice a colleague's activity        | New follows and likes produced no alerts, and shared manuscript-note replies were silent.                          | Actionable follow, like, shared-note and reply alerts; private-note isolation and repeated-toggle deduplication verified.                                  |
| Continue reviewing confidential work | Text-only note updates could silently revert shared visibility, and some mutations trusted preflight block checks. | Preserve visibility on omitted fields and recheck access in the transaction. Existing multi-reviewer isolation tests and new shared-note regressions pass. |
| Find older research discussions      | A page full of private drafts or blocked authors could make a populated feed look empty.                           | Fill visible pages across raw chunks; global, author and following feeds are tested behind 240 hidden records.                                             |

Operational limits remain explicit: old message history has a bounded newest-record window, moderation reports require an operator, and live AI claims/attribution checks use bounded extracted text and optional bibliographic metadata rather than a plagiarism corpus or proof of correctness. This audit did not call the supplied live provider key because no provider implementation changed; existing adapter tests cover those boundaries without transmitting manuscript data.
