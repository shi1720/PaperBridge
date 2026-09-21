import { describe, expect, it } from "vitest";
import { authErrorMessage } from "../src/lib/auth-errors";

describe("authentication recovery", () => {
  it("gives recoverable guidance for cancelled and blocked Google popups", () => {
    expect(authErrorMessage({ code: "auth/popup-closed-by-user" })).toContain(
      "cancelled",
    );
    expect(authErrorMessage({ code: "auth/popup-blocked" })).toContain(
      "Allow pop-ups",
    );
  });
  it("protects existing accounts instead of recommending another registration", () => {
    expect(
      authErrorMessage({
        code: "auth/account-exists-with-different-credential",
      }),
    ).toContain("existing workspace");
    expect(authErrorMessage({ code: "auth/email-already-in-use" })).toContain(
      "Choose Sign in",
    );
  });
  it("does not expose account existence or raw provider internals", () => {
    expect(authErrorMessage({ code: "auth/user-not-found" })).toBe(
      authErrorMessage({ code: "auth/wrong-password" }),
    );
    expect(
      authErrorMessage({ message: "internal token=secret" }),
    ).not.toContain("secret");
  });
});
