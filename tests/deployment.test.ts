import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
const require = createRequire(import.meta.url);
const { readdirRecursive } = require("firebase-tools/lib/fsAsync");
describe.each(["firebase.json", "firebase.production.json"])(
  "Firebase deployment credential boundary: %s",
  (configPath) => {
    it("the actual CLI packager inventory excludes local secrets/env files but keeps compiled runtime", async () => {
      const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
      const fixture = await mkdtemp(join(tmpdir(), "paperbridge-deploy-"));
      try {
        await mkdir(join(fixture, "lib"));
        await mkdir(join(fixture, "test"));
        for (const filename of [
          ".secret.local",
          ".secret.production",
          ".env",
          ".env.production",
          ".env.local",
          ".env.example",
          "package.json",
          "lib/index.js",
          "test/private-fixture.cjs",
        ])
          await writeFile(join(fixture, filename), "dummy fixture only");
        const files = await readdirRecursive({
          path: fixture,
          ignoreStrings: config.functions[0].ignore,
        });
        const included = files.map((file: { name: string }) =>
          file.name.slice(fixture.length + 1),
        );
        expect(included.sort()).toEqual(["lib/index.js", "package.json"]);
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    });
    it("the current functions inventory contains no env/secret credential files", async () => {
      const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
      const files = await readdirRecursive({
        path: resolve("functions"),
        ignoreStrings: config.functions[0].ignore,
      });
      expect(
        files.some((file: { name: string }) =>
          file.name.endsWith("/assets/paperbridge-mark.png"),
        ),
      ).toBe(true);
      expect(
        files.filter((file: { name: string }) =>
          /^\.(secret|env)/.test(basename(file.name)),
        ),
      ).toHaveLength(0);
    });
  },
);
