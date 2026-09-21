const fs = require("node:fs");
const crypto = require("node:crypto");
const file = "functions/.secret.local";
if (!fs.existsSync(file))
  fs.writeFileSync(
    file,
    "AI_KEY_ENCRYPTION_KEY=" +
      crypto.randomBytes(32).toString("base64") +
      "\nSMTP_PASSWORD=emulator-only\n",
    { mode: 0o600 },
  );
console.log("Emulator-only secrets are ready. No production credentials used.");
