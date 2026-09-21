import { describe, it, expect } from "vitest";
import { notificationPath } from "../src/lib/notifications";
describe("notification destinations", () => {
  it("opens supported routes and repairs legacy social links", () => {
    for (const path of [
      "/requests/request_1",
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
