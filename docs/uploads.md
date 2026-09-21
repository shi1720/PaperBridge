# Private manuscript uploads

The browser sends the original PDF as an authenticated raw request to `paperbridgeUploadManuscript`. It obtains an ID token from the configured PaperBridge Auth tenant and keeps upload progress visible. `VITE_UPLOAD_URL` can override the derived function URL; emulator browser tests explicitly clear this override and the production tenant setting.

The server verifies the token, revocation and tenant before accessing manuscripts. It rejects bodies larger than 20 MiB, non-PDF content types, compressed bodies, invalid PDF headers, foreign manuscripts and deleting accounts. The account/action allowance is twelve uploads per minute. Production browser origins must match `APP_URL`; emulator origins are limited to localhost.

Every upload receives a server-selected UUID object name under the authenticated owner's manuscript folder. The GCS write uses generation-match zero, private no-store cache metadata and no Firebase download token. An account-operation lease spans the ownership check and completed object write, so account deletion waits for earlier uploads and rejects later ones. Direct Firebase Storage reads and writes are denied. Manuscript reads continue through the existing authorization check and short-lived signed download URLs.

The HTTP function allows two instances, four concurrent requests per instance and a two-minute timeout. Its 20 MiB body cap leaves room below the platform request limit. The header check is a bounded format screen; PDF.js performs actual document parsing in the reader and extraction flow.

Validation is split between `functions/test/uploads.test.cjs` (authentication order, ownership, lease lifetime, format/size boundaries, CORS, immutable write options and redacted errors), `functions/test/uploads.integration.cjs` (real Functions/Auth/Firestore/Storage emulator HTTP requests), and the two-user Playwright manuscript journey (browser upload, rendering and revision).
