import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const full = process.argv.includes("--full");
const plan = process.argv.includes("--plan") || !full;

function command(commandName, args) {
  return spawnSync(commandName, args, { cwd: root, encoding: "utf8", stdio: full ? "inherit" : "pipe" });
}

function capturedCommand(commandName, args) {
  return spawnSync(commandName, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function activeDevelopmentServer() {
  const marker = resolve(root, ".xmf-dev-server.pid");
  if (existsSync(marker)) {
    const pid = Number(readFileSync(marker, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0) return { pid, source: "project-pid-marker" };
  }
  const listener = capturedCommand("lsof", ["-nP", "-t", "-iTCP:3000", "-sTCP:LISTEN"]);
  const pid = Number(String(listener.stdout || "").trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? { pid, source: "port-3000-listener" } : null;
}

function nodeVersion() { return String(capturedCommand("node", ["-v"]).stdout || "").trim(); }
function packageManagerVersion() { return String(capturedCommand("corepack", ["pnpm", "-v"]).stdout || "").trim(); }

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const devPid = activeDevelopmentServer();
const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const publicSecretNames = envExample.split(/\r?\n/).filter((line) => /^NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASSWORD)/i.test(line)).map((line) => line.split("=", 1)[0]);
const result = {
  mode: plan ? "PLAN" : "FULL",
  runtime: { node: nodeVersion(), requiredNodeMajor: 20, packageManager: packageManagerVersion(), requiredPackageManager: String(packageJson.packageManager || "") },
  activeDevelopmentServer: devPid ? { ...devPid, buildBlocked: true } : null,
  sourceSafety: { envLocalIgnored: /\.env\*?\.local/.test(gitignore), generatedBackupsIgnored: /(?:^|\n)backups\//.test(gitignore), publicSecretNames },
  migrationPolicy: "No remote migration or production database operation is performed by this verifier."
};

if (!/^v20\./.test(result.runtime.node)) result.runtime.warning = "Required Node 20 runtime is not active.";
if (full) {
  result.checks = [];
  for (const [name, executable, args] of [
    ["typecheck", "corepack", ["pnpm", "typecheck"]],
    ["lint", "corepack", ["pnpm", "lint"]]
  ]) {
    const check = command(executable, args);
    result.checks.push({ name, passed: check.status === 0 });
    if (check.status !== 0) process.exitCode = 1;
  }
  const testFiles = readdirSync(resolve(root, "tests")).filter((name) => name.endsWith(".ts") || name.endsWith(".mjs")).map((name) => `tests/${name}`);
  const tests = command("node", ["--no-warnings", "--import", "tsx", "--test", ...testFiles]);
  result.checks.push({ name: "tests", passed: tests.status === 0 });
  if (tests.status !== 0) process.exitCode = 1;
  if (!devPid) {
    const build = command("corepack", ["pnpm", "build"]);
    result.checks.push({ name: "build", passed: build.status === 0 });
    if (build.status !== 0) process.exitCode = 1;
  } else {
    result.checks.push({ name: "build", passed: false, status: "BLOCKED_BY_ACTIVE_DEV_SERVER", pid: devPid.pid });
    process.exitCode = 2;
  }
}
console.log(JSON.stringify(result, null, 2));
