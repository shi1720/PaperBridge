export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user":
      "Google sign-in was cancelled. You can try again when you’re ready.",
    "auth/cancelled-popup-request":
      "Another sign-in window is already open. Finish signing in there.",
    "auth/popup-blocked":
      "Your browser blocked the Google sign-in window. Allow pop-ups for PaperBridge and try again, or sign in with email.",
    "auth/account-exists-with-different-credential":
      "An account already uses this email with another sign-in method. Sign in using that method to keep your existing workspace.",
    "auth/invalid-credential":
      "The email or password is incorrect. Try again or reset your password.",
    "auth/wrong-password":
      "The email or password is incorrect. Try again or reset your password.",
    "auth/user-not-found":
      "The email or password is incorrect. Try again or reset your password.",
    "auth/email-already-in-use":
      "An account already uses this email. Choose Sign in or reset your password.",
    "auth/network-request-failed":
      "Sign-in could not connect. Check your internet connection and try again.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment before trying again.",
    "auth/user-disabled":
      "This account has been disabled. Please contact PaperBridge support.",
    "auth/unauthorized-domain":
      "Google sign-in is unavailable on this address. Open paperbridge.web.app and try again.",
    "auth/operation-not-allowed":
      "This sign-in method is temporarily unavailable. Please use email or try again later.",
    "auth/invalid-api-key":
      "Sign-in is temporarily unavailable. Please try again later.",
  };
  return (
    messages[code || ""] ||
    "We couldn’t finish signing in. Please try again. If your account was created, sign in to finish your profile."
  );
}
