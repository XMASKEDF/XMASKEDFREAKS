import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

const marker = path.join(process.cwd(), ".xmf-dev-server.pid");
const pid = Number(await readFile(marker, "utf8").catch(() => ""));

if (!pid) process.exit(0);

let alive = false;
try {
  process.kill(pid, 0);
  alive = true;
} catch (error) {
  alive = error?.code === "EPERM";
}

if (alive) {
  throw new Error(`Stop the XMASKEDFREAKS development server (PID ${pid}) before creating a production build. Concurrent Next.js compilers can invalidate or stall generated style chunks.`);
}

await unlink(marker).catch(() => undefined);
