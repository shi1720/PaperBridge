# Google sign-in

PaperBridge uses Firebase's Google popup flow with the existing Identity Platform project (`gen-lang-client-0444960702`) and the isolated `PaperBridge-t4997` tenant. The tenant's `google.com` provider is enabled using the project's existing OAuth web client; the client secret remains in Identity Platform. No OAuth secret is included in the frontend.

The production Hosting domains are already in the project's authorized domains. `VITE_GOOGLE_AUTH_ENABLED=true` exposes the entry point in signup and login; non-emulator deployments keep it off until provider setup is complete. The existing Firebase auth domain handles the popup. This avoids relying on cross-site redirect storage. Browsers that block popups receive guidance to allow the window or use email.

Only the default Google identity scopes are requested. Users select an account explicitly. A new profile takes the selected researcher/endorser role and Google display name, with no invented institutional affiliation. Returning users retain their existing role, name, research categories and privacy settings. Failed/cancelled authentication does not create a profile. Google-verified accounts do not need a second email-verification step. Email and password recovery remain available.

Regression coverage includes the real Auth Emulator Google provider window, chosen-role creation, verified-email state, returning-account identity/profile preservation and popup cancellation. Error mapping covers blocked windows, network failures and credential conflicts without exposing raw provider errors. The phone/iPad auth layout is covered by the responsive suite. Production verification also uses a real Google account and checks session restoration after reload.
