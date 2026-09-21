const fs = require("node:fs");
const crypto = require("node:crypto");
const file = "functions/.secret.local";
let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
// Migrate the existing ignored emulator file without printing or changing key material.
content = content
  .replace(/^AI_KEY_ENCRYPTION_KEY=/gm, "PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY=")
  .replace(/^SMTP_PASSWORD=/gm, "PAPERBRIDGE_SMTP_PASSWORD=");
if (!/^PAPERBRIDGE_AI_KEY_ENCRYPTION_KEY=/m.test(content))
  content +=
    "\nPAPERBRIDGE_AI_KEY_ENCRYPTION_KEY=" +
    crypto.randomBytes(32).toString("base64") +
    "\n";
if (!/^PAPERBRIDGE_SMTP_PASSWORD=/m.test(content))
  content += "PAPERBRIDGE_SMTP_PASSWORD=emulator-only\n";
fs.writeFileSync(file, content, { mode: 0o600 });
fs.chmodSync(file, 0o600);
console.log(
  "Namespaced emulator-only secrets are ready. No production credentials used.",
);
