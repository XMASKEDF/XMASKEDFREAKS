import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const marker = path.join(process.cwd(), ".xmf-dev-server.pid");

async function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

const existing = Number(await readFile(marker, "utf8").catch(() => ""));
if (existing && await processIsAlive(existing)) {
  throw new Error(`XMASKEDFREAKS development server is already running (PID ${existing}).`);
}

await writeFile(marker, String(process.pid), "utf8");

const nextBin = path.join(process.cwd(), "node_modules", ".bin", "next");
const child = spawn(nextBin, ["dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  // The local sandbox can reject native watcher handles with EMFILE. Polling
  // keeps Next focused on this project without widening the OS watcher load.
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-development",
    WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || "true"
  }
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    child.kill(signal);
  });
}

const exitCode = await new Promise((resolve) => {
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 0 : 1)));
  child.once("error", () => resolve(1));
});

const currentMarker = await readFile(marker, "utf8").catch(() => "");
if (currentMarker.trim() === String(process.pid)) await unlink(marker).catch(() => undefined);
process.exitCode = Number(exitCode);
