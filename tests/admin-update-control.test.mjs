import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("Update Control is protected by the existing Admin authorization path", async () => {
  const page = await source("app/admin/update-control/page.tsx");
  const component = await source("components/admin/UpdateControl.tsx");
  const registry = await source("lib/admin-update-registry.ts");

  assert.match(page, /getAdminBySession/);
  assert.match(page, /hasAdminPermission\(admin, "admin\.dashboard\.read"\)/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(component, /^"use client";/);
  assert.match(component, /\/admin\/merch/);
  assert.match(component, /\/admin#streaming/);
  assert.match(component, /\/sandbox/);
  assert.match(registry, /XMASKEDFREAKS UPDATE/);
  assert.match(registry, /SANDBOX/);
  assert.match(registry, /status: "tested"/);
});

test("Update Control does not expose Admin in public navigation or preview", async () => {
  const adminPage = await source("app/admin/page.tsx");
  const publicNavigation = await source("components/PublicNavigation.tsx");
  const preview = await source("components/admin/AdminCustomerPreview.tsx");

  assert.match(adminPage, /href="\/admin\/update-control"/);
  assert.doesNotMatch(publicNavigation, /\/admin\/update-control/);
  assert.match(preview, /sandbox="allow-forms allow-modals allow-popups allow-scripts"/);
  assert.match(preview, /customer-preview=1/);
});

test("Update Control remains separate from the established audit ledger", async () => {
  const auth = await source("lib/admin-auth.ts");
  const audit = await source("lib/infrastructure/audit-ledger.ts");
  const component = await source("components/admin/UpdateControl.tsx");

  assert.match(auth, /appendAuditLedgerEvent/);
  assert.match(audit, /sensitiveKey/);
  assert.doesNotMatch(component, /fetch\("\/api\/admin/);
});
