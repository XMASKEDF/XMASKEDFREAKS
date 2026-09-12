import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const requested = process.argv.find((value) => value.startsWith("--artifact="))?.slice("--artifact=".length) || "supabase/pre_migration_backup.sql";
const restore = process.argv.includes("--restore");
const artifact = resolve(root, requested);

function fail(message, code = 1) {
  console.error(`BACKUP VERIFICATION BLOCKED: ${message}`);
  process.exit(code);
}

if (!artifact.startsWith(`${root}${sep}`)) fail("The artifact must remain inside the project.");
if (!existsSync(artifact)) fail(`Artifact not found: ${requested}`);
const contents = readFileSync(artifact);
const checksum = createHash("sha256").update(contents).digest("hex");
const sidecar = `${artifact}.sha256`;
const expected = String(process.env.BACKUP_EXPECTED_SHA256 || (existsSync(sidecar) ? readFileSync(sidecar, "utf8").trim().split(/\s+/)[0] : "")).toLowerCase();
const checksumStatus = expected ? (expected === checksum ? "VERIFIED" : "MISMATCH") : "CALCULATED_UNVERIFIED";
if (checksumStatus === "MISMATCH") fail("The artifact checksum does not match its expected checksum.");

console.log(JSON.stringify({ artifact: requested, bytes: contents.byteLength, checksum, checksumStatus, restoreTest: restore ? "REQUESTED" : "NOT_REQUESTED" }));
if (!restore) process.exit(0);

const docker = spawnSync("docker", ["info"], { cwd: root, stdio: "ignore" });
if (docker.error || docker.status !== 0) fail("LOCAL RESTORE TEST BLOCKED — DOCKER REQUIRED", 2);
if (String(process.env.BACKUP_CONFIRM_ISOLATED_RESTORE || "") !== "YES") fail("A restore target and BACKUP_CONFIRM_ISOLATED_RESTORE=YES are required. No restore was attempted.");
if (!String(process.env.BACKUP_RESTORE_DB_URL || "").trim()) fail("BACKUP_RESTORE_DB_URL is missing. No restore was attempted.");
fail("An isolated restore target is configured, but this repository command does not automatically mutate it. Use the approved restore workflow and record its evidence.");
