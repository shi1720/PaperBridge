// Uses the existing Firebase CLI login; never prints credentials.
const { Client } = require("firebase-tools/lib/apiv2");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { getGlobalDefaultAccount } = require("firebase-tools/lib/auth");
async function client(origin) {
  await requireAuth({ ...getGlobalDefaultAccount(), nonInteractive: true });
  return new Client({ urlPrefix: origin, auth: true });
}
module.exports = { client };
