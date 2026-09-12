import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const requestedType = String(process.argv[2] || "schema").toLowerCase();
const allowedTypes = new Set(["schema", "data", "full"]);
const target = String(process.env.BACKUP_TARGET || "LOCAL").toUpperCase();
const databaseUrl = String(process.env.BACKUP_DB_URL || "").trim();

function fail(message) {
  console.error(`BACKUP NOT CREATED: ${message}`);
  process.exit(1);
}

if (!allowedTypes.has(requestedType)) fail("Choose schema, data, or full.");
if (!["LOCAL", "SANDBOX", "ISOLATED"].includes(target)) fail("This command only accepts LOCAL, SANDBOX, or ISOLATED targets. Production backups require the approved provider workflow.");
if (!databaseUrl) fail("BACKUP_DB_URL is missing. No database command was run.");

let parsed;
try { parsed = new URL(databaseUrl); } catch { fail("BACKUP_DB_URL is not a valid PostgreSQL URL."); }
if (!parsed || !["postgres:", "postgresql:"].includes(parsed.protocol)) fail("BACKUP_DB_URL must use a PostgreSQL protocol.");
if (/(supabase\.co$|production|prod)/i.test(parsed.hostname)) fail("The target hostname looks production-like; use an isolated backup target instead.");

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const output = resolve(root, "backups", "database", `${timestamp}-${requestedType}.sql`);
mkdirSync(dirname(output), { recursive: true });
const args = ["--dbname", databaseUrl, "--format=plain", "--file", output];
if (requestedType === "schema") args.push("--schema-only");
if (requestedType === "data") args.push("--data-only");
const result = spawnSync("pg_dump", args, { cwd: root, stdio: "inherit" });
if (result.error || result.status !== 0) fail(result.error?.message || "pg_dump did not complete successfully.");

const checksum = createHash("sha256").update(readFileSync(output)).digest("hex");
writeFileSync(`${output}.sha256`, `${checksum}  ${output.split("/").pop()}\n`, { flag: "wx" });
writeFileSync(`${output}.json`, JSON.stringify({ target, type: requestedType, createdAt: new Date().toISOString(), checksum, restoreRequired: true }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ created: true, target, type: requestedType, artifact: output.slice(root.length + 1), checksum }));
