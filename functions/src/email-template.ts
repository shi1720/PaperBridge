import { getApps } from "firebase-admin/app";
/** One email-safe design for every transactional message. Never accepts raw HTML. */
export interface EmailPresentation {
  eyebrow: string;
  heading: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  manuscript?: string;
  category?: string;
  note?: string;
}
export interface EmailContent {
  subject: string;
  body: string;
  kind?: string;
  presentation?: EmailPresentation;
}
export const EMAIL_LOGO_CID = "paperbridge-mark";
const escape = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

/** Links come from server-owned templates, with a second allowlist at rendering. */
export function safeEmailAction(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    const app = new URL(process.env.APP_URL || "https://paperbridge.web.app");
    const project =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      getApps()[0]?.options.projectId;
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (
      url.origin === app.origin &&
      (/^\/requests\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
        url.pathname === "/")
    )
      return url.href;
    if (
      project &&
      url.hostname === `${project}.firebaseapp.com` &&
      url.port === "" &&
      url.pathname === "/__/auth/action"
    )
      return url.href;
  } catch {
    /* Invalid links are never made actionable. */
  }
}

export function renderEmail(job: EmailContent): { html: string; text: string } {
  const fallbackUrl = job.body
    .match(/https:\/\/[^\s]+/g)
    ?.find((url) => safeEmailAction(url));
  const p: EmailPresentation = job.presentation || {
    eyebrow:
      job.kind === "auth-verification"
        ? "YOUR PAPERBRIDGE ACCOUNT"
        : "YOUR RESEARCH WORKSPACE",
    heading: job.subject.replace(/^PaperBridge:\s*/i, ""),
    intro: job.body
      .split("\n\n")
      .filter((paragraph) => !paragraph.includes(fallbackUrl || "\0"))
      .join("\n\n"),
    actionLabel:
      job.kind === "auth-verification"
        ? "Verify email address"
        : "Open PaperBridge",
    actionUrl: fallbackUrl,
  };
  const action = safeEmailAction(p.actionUrl);
  const paragraphs = (value: string) =>
    value
      .split(/\n\n+/)
      .map(
        (part) =>
          `<p style="margin:0 0 18px;color:#506258;font:16px/1.65 Arial,Helvetica,sans-serif;overflow-wrap:anywhere;">${escape(part).replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(job.subject)}</title>
<style>@media only screen and (max-width:620px){.outer{padding:20px 12px!important}.content{padding:28px 24px!important}.headline{font-size:30px!important}.brand{padding:0 12px 24px!important}}</style></head>
<body style="margin:0;padding:0;background:#f7f7ef;color:#183e34;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#f7f7ef;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(p.intro.slice(0, 180))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7f7ef"><tr><td class="outer" align="center" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td class="brand" style="padding:0 8px 28px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="42" valign="middle"><img src="cid:${EMAIL_LOGO_CID}" width="32" height="32" alt="" style="display:block;border:0;"></td><td valign="middle" style="font:bold 26px/1 Arial,Helvetica,sans-serif;letter-spacing:-1px;color:#183e34;">paperbridge<span style="color:#58734c;">.</span></td></tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #dce2d8;border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:6px;background:#dcef9c;border-radius:16px 16px 0 0;font-size:0;line-height:6px;">&nbsp;</td></tr>
<tr><td class="content" style="padding:40px;">
<p style="margin:0 0 18px;color:#58734c;font:bold 11px/1.5 Arial,Helvetica,sans-serif;letter-spacing:2px;">${escape(p.eyebrow)}</p>
<h1 class="headline" style="margin:0 0 22px;color:#183e34;font:normal 36px/1.16 Georgia,'Times New Roman',serif;letter-spacing:-0.7px;">${escape(p.heading)}</h1>
${paragraphs(p.intro)}
${p.manuscript ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 28px;"><tr><td style="background:#f7f7ef;border-left:3px solid #dcef9c;padding:20px 22px;"><p style="margin:0 0 8px;color:#58734c;font:bold 10px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.5px;">THE MANUSCRIPT${p.category ? ` · ${escape(p.category)}` : ""}</p><p style="margin:0;color:#183e34;font:normal 21px/1.4 Georgia,'Times New Roman',serif;overflow-wrap:anywhere;">${escape(p.manuscript)}</p></td></tr></table>` : ""}
${action ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;"><tr><td bgcolor="#183e34" style="border-radius:6px;text-align:center;mso-padding-alt:16px 26px;"><a href="${escape(action)}" style="background:#183e34;border:1px solid #183e34;border-radius:6px;color:#ffffff;display:inline-block;padding:16px 26px;text-decoration:none;font:bold 14px/1.4 Arial,Helvetica,sans-serif;mso-padding-alt:0;">${escape(p.actionLabel || "Open PaperBridge")} &nbsp; &#8594;</a></td></tr></table>` : ""}
${p.note ? `<p style="margin:0;padding-top:24px;border-top:1px solid #e6eade;color:#657367;font:13px/1.65 Arial,Helvetica,sans-serif;">${escape(p.note)}</p>` : ""}
</td></tr></table></td></tr>
${action ? `<tr><td style="padding:22px 12px 0;color:#657367;font:12px/1.6 Arial,Helvetica,sans-serif;">If the button doesn’t work, copy and paste this link into your browser:<br><a href="${escape(action)}" style="color:#365c49;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${escape(action)}</a></td></tr>` : ""}
<tr><td style="padding:28px 12px 0;color:#657367;font:12px/1.7 Arial,Helvetica,sans-serif;"><strong style="color:#365c49;">Independent minds. Shared progress.</strong><br>PaperBridge · A thoughtful place for research.<br>This is a transactional message about your PaperBridge account or research activity.</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { html, text: job.body };
}
