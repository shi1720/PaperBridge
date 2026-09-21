import { describe, it, expect } from "vitest";
import { notificationKind, notificationPath } from "../src/lib/notifications";
describe("notification destinations", () => {
  it("opens supported routes and repairs legacy social links", () => {
    for (const path of [
      "/requests/request_1",
      "/researchers/author-1",
      "/papers/paper-1",
      "/community#post-abc",
      "/messages?chat=a_b",
    ])
      expect(notificationPath(path)).toBe(path);
    expect(notificationPath("/feed")).toBe("/community");
    expect(notificationPath("/messages/a_b")).toBe("/messages?chat=a_b");
  });
  it("does not navigate to external or unrecognized destinations", () => {
    for (const path of [
      undefined,
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "/messages?chat=x&redirect=https://evil.test",
      "/requests/../settings",
    ])
      expect(notificationPath(path)).toBeUndefined();
  });
});

describe("activity categories", () => {
  it("groups only validated destinations and supports legacy notifications", () => {
    expect(notificationKind("/requests/abc")).toBe("research");
    expect(notificationKind("/papers/abc")).toBe("research");
    expect(notificationKind("/feed")).toBe("discussion");
    expect(notificationKind("/community#post-abc")).toBe("discussion");
    expect(notificationKind("/messages/a_b")).toBe("message");
    expect(notificationKind("/researchers/abc")).toBe("connection");
    expect(notificationKind("https://example.test/messages?chat=abc")).toBe(
      "other",
    );
  });
});
