import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import electron from "electron";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ configFile: fileURLToPath(new URL("../vite.config.js", import.meta.url)) });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`renderer at ${url}`);

const child = spawn(electron, ["."], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, STRATA_DEV_URL: url },
});

child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
