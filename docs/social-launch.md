# Research community launch

The public homepage now gives the social network its own navigation entry and feature section alongside explicit endorsement requests, category filters, researcher profiles and concrete AI review examples. All example passages and AI output remain labeled as illustrative. No fictional researchers, activity counts or testimonials were added to production.

## Connected member journeys

- `/researchers` finds public profiles across both researcher and endorser roles. Category, name, institution and headline filtering apply. The endorsement directory at `/discover` keeps its existing endorser-only scope and availability controls.
- `/researchers/:id` shows the member’s biography, categories, optional affiliation, arXiv author link and ORCID. Members can follow or open a private conversation. Private profiles are denied to other members, and blocked users cannot access each other’s profiles.
- Feed author and commenter names open those profiles. Community navigation and the message picker discover ordinary researchers as well as endorsers.
- Following now queries followed authors on the server, so newer unrelated posts do not displace all followed content. Unfollowing still works after the target’s profile becomes private or is removed.
- Comment notifications open the actual post and its discussion, including older posts outside the latest feed. Message notifications open the relevant private chat. Legacy social notification destinations are normalized, and only supported local routes are actionable.

## Operational boundaries

Community posts are visible to signed-in members; posting does not publish a private manuscript. Only manuscripts explicitly made public can be attached. Private chat is limited to participants, with operator access as stated in the privacy notice. Existing blocking, reporting, deletion and authenticated-action checks remain in place.

The directory considers up to 200 public profiles per query before text/block filtering. The feed displays the latest 100 posts; the API also accepts a bounded limit and a `(createdAt, id)` cursor. Following supports up to 300 accounts, queried in batches of 30; new follows above the cap receive an explicit error, and removal is always available. These are bounded initial-release views, not exhaustive research indexes or personalized ranking.

Required named-database composite indexes: profiles (`publicProfile`, `categories`) and posts (`authorId`, `createdAt`, document ID). Deploy indexes and wait for readiness before rolling out the updated callable and Hosting bundle.

## Verification

The real-emulator browser journey creates two ordinary researcher accounts, publishes a post, discovers a public profile, follows its author, checks the Following feed, likes and comments, follows a comment notification, starts a private message using the general researcher picker, opens the message notification, and verifies that making a profile private denies the other member access.

Backend regressions exercise general-directory visibility/blocking, an older followed post behind 105 unrelated posts, multi-batch following queries with tied timestamps and cursors, the follow cap, private/deleted-profile unfollowing, focused post access and notification routes. Accessibility checks cover the new directory and profile at desktop and mobile widths. Homepage layouts are inspected at 320, 390, 768, 1024 and 1440 pixels.
