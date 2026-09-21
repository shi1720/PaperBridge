/** Restrict stored notification destinations to supported local app routes. */
export function notificationPath(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (value === "/feed") return "/community";
  const oldChat = /^\/messages\/([a-zA-Z0-9_-]+)$/.exec(value);
  if (oldChat) return "/messages?chat=" + oldChat[1];
  if (
    /^\/(requests|papers|researchers)\/[a-zA-Z0-9_-]+$/.test(value) ||
    /^\/community(?:#post-[a-zA-Z0-9_-]+)?$/.test(value) ||
    /^\/messages\?chat=[a-zA-Z0-9_-]+$/.test(value)
  )
    return value;
}

/** Group activity by its validated destination, never by user supplied copy. */
export function notificationKind(
  value: unknown,
): "research" | "discussion" | "message" | "connection" | "other" {
  const path = notificationPath(value);
  if (path?.startsWith("/requests/") || path?.startsWith("/papers/"))
    return "research";
  if (path?.startsWith("/community")) return "discussion";
  if (path?.startsWith("/messages?")) return "message";
  if (path?.startsWith("/researchers/")) return "connection";
  return "other";
}
