import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/verysure_test")
  throw new Error(
    "Integration tests require the dedicated verysure_test database.",
  );
const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("prisma/package.json")),
  "build/index.js",
);
const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
process.exit(result.status ?? 1);
