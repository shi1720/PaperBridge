const { spawnSync } = require("node:child_process");
const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  GCLOUD_PROJECT: "demo-paperbridge",
};
for (const args of [
  ["--prefix", "functions", "run", "test:integration"],
  ["run", "test:e2e"],
]) {
  const r = spawnSync("npm", args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status || 1);
}
