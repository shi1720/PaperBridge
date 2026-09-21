# Transactional email setup

Research checked 21 September 2026. Brevo Free signup, account validation and the PaperBridge sender identity are complete. Anonymous transactional tracking is enabled. The dedicated PaperBridge production SMTP key is active and stored only in Google Secret Manager. The deployed worker accepted six messages on the first attempt; Gmail received five in Inbox and one submission confirmation in Spam. Both verification links were redeemed successfully. See [live email verification](live-email-verification.json) for the exact result.

Brevo Free is the most feasible starting option without purchasing a domain. Its free plan has no time limit and allows 300 sends/day. Our default local daily cap is 250 to leave margin; it is not a reservation of provider capacity. [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

Brevo temporarily rewrites unauthenticated/free-address transactional senders onto an account-specific Brevo domain. The live messages used `12209039.brevosend.com`; SPF, DKIM and DMARC passed on the message classified as Spam. It describes this as a stopgap, not a permanent domain strategy. Do not claim a branded authenticated sender without configuring one. [Sender requirements and replacement addresses](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

Use an account and sender inbox controlled by the project owner. Verify the sender using the emailed code. Check that transactional sending is activated; Brevo documents a separate activation step and may require a support ticket. Its SMTP login is a technical identity and must not be used as the From address. [Brevo SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

Configure these non-secret values in the backend's project-specific environment file:

```dotenv
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USER=the-SMTP-login-shown-in-Brevo
EMAIL_FROM=PaperBridge <the-verified-sender-address>
EMAIL_REPLY_TO=the-owner-controlled-support-address
EMAIL_HOURLY_LIMIT=50
EMAIL_DAILY_LIMIT=250
EMAIL_MONTHLY_LIMIT=7000
APP_URL=https://paperbridge.web.app
```

Store the **SMTP key**, not the Brevo API key or account password, as `PAPERBRIDGE_SMTP_PASSWORD` in Secret Manager for the backend project. Port 465 uses implicit TLS; 587 or 2525 uses mandatory STARTTLS. The backend already supports this SMTP configuration; no provider-specific API integration is required. [Send using Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [SMTP keys](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys).

After deployment, create an authorized test endorsement request and check both outbox records, provider logs, and both intended recipient inboxes. `sent` means SMTP acceptance. A missing SMTP setup leaves notifications visible in the app and mail honestly queued; failed jobs do not retry indefinitely. The app does not implement bounce/webhook reconciliation and cannot label final inbox delivery confirmed automatically.

Alternatives have additional constraints. Resend's `resend.dev` test sender sends only to the account's own address, so it cannot serve real request recipients without an owned, verified domain. [Resend test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). SMTP2GO's free plan permits 1,000/month, with stricter limits when a domain is not verified; single-address verification can fail when the sender domain has DMARC. Recheck this before treating it as a Gmail-sender fallback. [SMTP2GO free plan](https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan), [sender verification](https://support.smtp2go.com/hc/en-gb/articles/9150216032537-Verified-Senders-Sender-Domain-vs-Single-Sender-Emails).

## Credential maintenance

The PaperBridge production key was created on September 21, 2026 and expires September 21, 2027. Brevo also expires SMTP keys after 90 days of inactivity. Rotate the dedicated key into a new `PAPERBRIDGE_SMTP_PASSWORD` secret version and redeploy both email workers before expiry. Never commit the key or expose it in client configuration. Inbox placement remains provider-dependent; the app preserves in-app notifications and directs users to check Spam for verification mail.

## Branded messages

Every outbox email uses the shared [PaperBridge email design](email-design.md), including app-initiated password recovery. The inline logo ships in the Functions archive; it is not loaded from an external image host. A text-only alternative and a copyable action link remain available.
