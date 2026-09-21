/** Restrict stored notification destinations to supported local app routes. */
export function notificationPath(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (value === "/feed") return "/community";
  const oldChat = /^\/messages\/([a-zA-Z0-9_-]+)$/.exec(value);
  if (oldChat) return "/messages?chat=" + oldChat[1];
  if (
    /^\/(requests|papers)\/[a-zA-Z0-9_-]+$/.test(value) ||
    /^\/community(?:#post-[a-zA-Z0-9_-]+)?$/.test(value) ||
    /^\/messages\?chat=[a-zA-Z0-9_-]+$/.test(value)
  )
    return value;
}
