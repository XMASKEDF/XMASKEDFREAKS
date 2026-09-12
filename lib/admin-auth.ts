import bcrypt from "bcryptjs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual
} from "crypto";
import { emailConfiguration, getEmailProvider } from "@/lib/email/provider";
import { assertNoLegacyAdminBypass, isAdminDevAuthEnabled } from "@/lib/admin-dev-bypass";
import { appendAuditLedgerEvent } from "@/lib/infrastructure/audit-ledger";

export const adminSessionCookie = "xmf_admin_session";
export const adminChallengeCookie = "xmf_admin_challenge";

export type AdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "INVENTORY_MANAGER"
  | "CUSTOMER_SUPPORT"
  | "MARKETING"
  | "CONTENT_MANAGER"
  | "MODERATOR";

export type AdminPermission =
  | "admin.dashboard.read"
  | "admin.security.manage"
  | "admin.users.manage"
  | "admin.audit.read"
  | "admin.content.manage"
  | "admin.commerce.manage"
  | "admin.customers.manage"
  | "admin.operations.manage";

export type AdminUser = {
  id: string;
  username: string;
  display_name?: string | null;
  email: string;
  recovery_email?: string | null;
  password_hash: string;
  role: AdminRole | "ADMIN";
  is_super_admin?: boolean;
  permissions?: string[];
  first_setup_completed?: boolean;
  two_factor_required: boolean;
  two_factor_enabled: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at?: string | null;
};

type LoginContext = {
  ipAddress: string;
  userAgent: string;
};

type AdminSecuritySettings = {
  email_two_factor_enabled: boolean;
  session_timeout_minutes: number;
  inactivity_timeout_minutes: number;
  remember_device_days: number;
};

const defaultSecuritySettings: AdminSecuritySettings = {
  email_two_factor_enabled: false,
  session_timeout_minutes: 720,
  inactivity_timeout_minutes: 30,
  remember_device_days: 30
};

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    "admin.dashboard.read", "admin.security.manage", "admin.users.manage", "admin.audit.read",
    "admin.content.manage", "admin.commerce.manage", "admin.customers.manage", "admin.operations.manage"
  ],
  ADMIN: [
    "admin.dashboard.read", "admin.audit.read", "admin.content.manage", "admin.commerce.manage",
    "admin.customers.manage", "admin.operations.manage"
  ],
  INVENTORY_MANAGER: ["admin.dashboard.read", "admin.commerce.manage"],
  CUSTOMER_SUPPORT: ["admin.dashboard.read", "admin.customers.manage"],
  MARKETING: ["admin.dashboard.read", "admin.content.manage"],
  CONTENT_MANAGER: ["admin.dashboard.read", "admin.content.manage"],
  MODERATOR: ["admin.dashboard.read", "admin.customers.manage"]
};

const devRevokedSessions = new Set<string>();
const devSessionActivity = new Map<string, number>();
const devSessionReauthenticated = new Map<string, number>();
const devState = {
  firstSetupCompleted: false,
  displayName: "Super Admin",
  recoveryEmail: process.env.ADMIN_DEV_EMAIL || "",
  passwordHash: process.env.ADMIN_DEV_PASSWORD_HASH || "",
  failedLoginAttempts: 0,
  lockedUntil: null as string | null,
  lastLoginAt: null as string | null
};

function serviceCredentials() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || supabaseUrl.includes("your-project")) return null;
  return { supabaseUrl, serviceRoleKey };
}

async function supabaseRest(path: string, init: RequestInit = {}) {
  const credentials = serviceCredentials();
  if (!credentials) throw new Error("Supabase service credentials are required for production admin auth.");
  return fetch(`${credentials.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: credentials.serviceRoleKey,
      authorization: `Bearer ${credentials.serviceRoleKey}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function deviceHash(userAgent: string, ipAddress: string) {
  return hashToken(`${userAgent}|${ipAddress.split(".").slice(0, 3).join(".")}|${process.env.ADMIN_DEVICE_SALT || "development"}`);
}

function developmentAdmin(): AdminUser | null {
  assertNoLegacyAdminBypass();
  if (!isAdminDevAuthEnabled()) return null;
  const email = process.env.ADMIN_DEV_EMAIL?.trim().toLowerCase();
  const passwordHash = devState.passwordHash || process.env.ADMIN_DEV_PASSWORD_HASH;
  if (!email || !passwordHash) return null;
  return {
    id: "00000000-0000-4000-8000-000000000064",
    username: process.env.ADMIN_DEV_USERNAME || "owner",
    display_name: devState.displayName,
    email,
    recovery_email: devState.recoveryEmail || email,
    password_hash: passwordHash,
    role: "ADMIN",
    is_super_admin: true,
    permissions: rolePermissions.SUPER_ADMIN,
    first_setup_completed: true,
    two_factor_required: true,
    two_factor_enabled: false,
    failed_login_attempts: devState.failedLoginAttempts,
    locked_until: devState.lockedUntil,
    last_login_at: devState.lastLoginAt
  };
}

function devSessionSecret() {
  const secret = process.env.ADMIN_DEV_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ADMIN_DEV_SESSION_SECRET must contain at least 32 characters.");
  return secret;
}

function createSignedDevelopmentSession(admin: AdminUser, rememberDevice: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: admin.id,
    iat: now,
    exp: now + (rememberDevice ? 30 * 86400 : 12 * 3600),
    jti: randomBytes(16).toString("hex")
  })).toString("base64url");
  const signature = createHmac("sha256", devSessionSecret()).update(payload).digest("base64url");
  const token = `dev.${payload}.${signature}`;
  devSessionActivity.set(hashToken(token), Date.now());
  devSessionReauthenticated.set(hashToken(token), Date.now());
  return token;
}

function verifySignedDevelopmentSession(token: string) {
  const [prefix, payload, signature] = token.split(".");
  const tokenHash = hashToken(token);
  if (prefix !== "dev" || !payload || !signature || devRevokedSessions.has(tokenHash)) return false;
  const expected = createHmac("sha256", devSessionSecret()).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    const active = Number(decoded.exp || 0) > Math.floor(Date.now() / 1000);
    const lastActivity = devSessionActivity.get(tokenHash) || 0;
    if (!active || Date.now() - lastActivity > defaultSecuritySettings.inactivity_timeout_minutes * 60 * 1000) return false;
    devSessionActivity.set(tokenHash, Date.now());
    return true;
  } catch {
    return false;
  }
}

export function hasAdminPermission(admin: AdminUser, permission: AdminPermission) {
  if (admin.is_super_admin) return true;
  const role = admin.role as AdminRole;
  const permissions = new Set([...(rolePermissions[role] || []), ...(admin.permissions || [])]);
  return permissions.has(permission);
}

export async function getAdminCount() {
  if (developmentAdmin()) return 1;
  const response = await supabaseRest("admin_users?select=id&limit=1");
  if (!response.ok) return 0;
  const admins = await response.json();
  return Array.isArray(admins) ? admins.length : 0;
}

export async function auditAdminEvent(input: {
  adminUserId?: string | null;
  eventType: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}) {
  if (serviceCredentials()) {
    await supabaseRest("admin_audit_events", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        admin_user_id: input.adminUserId || null,
        event_type: input.eventType,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        metadata: input.metadata || {}
      })
    }).catch(() => undefined);
  }
  await appendAuditLedgerEvent({
    eventType: input.eventType,
    actorType: "ADMIN",
    actorId: input.adminUserId,
    targetType: "ADMIN_OPERATION",
    ipAddress: input.ipAddress,
    metadata: { ...input.metadata, userAgent: input.userAgent }
  });
}

async function recordLoginHistory(admin: AdminUser | null, context: LoginContext, result: string, reason?: string) {
  if (!serviceCredentials()) return;
  await supabaseRest("admin_login_history", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: admin?.id || null,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      device_hash: deviceHash(context.userAgent, context.ipAddress),
      result,
      failure_reason: reason || null
    })
  }).catch(() => undefined);
}

export async function createFirstAdmin(input: {
  username: string;
  email: string;
  password: string;
  setupSecret: string;
  ipAddress: string;
  userAgent: string;
}) {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!username || !email || input.password.length < 12) {
    throw new Error("Username, email, and a password of at least 12 characters are required.");
  }
  const expectedSecret = process.env.ADMIN_SETUP_SECRET;
  if (!expectedSecret || !safeEqual(hashToken(input.setupSecret), hashToken(expectedSecret))) {
    await auditAdminEvent({ eventType: "admin_setup_failed", ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { reason: "invalid setup secret" } });
    throw new Error("Invalid setup secret.");
  }
  if (await getAdminCount()) throw new Error("Admin setup is already locked.");

  const response = await supabaseRest("admin_users", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      username,
      display_name: username,
      email,
      recovery_email: email,
      password_hash: await bcrypt.hash(input.password, 12),
      role: "ADMIN",
      is_super_admin: true,
      permissions: rolePermissions.SUPER_ADMIN,
      two_factor_required: true,
      two_factor_enabled: false,
      first_setup_completed: false
    })
  });
  if (!response.ok) throw new Error("Unable to create first admin.");
  const [admin] = await response.json();
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_setup_completed", ipAddress: input.ipAddress, userAgent: input.userAgent });
  return admin as AdminUser;
}

async function findAdmin(identifier: string) {
  const value = identifier.trim().toLowerCase();
  const devAdmin = developmentAdmin();
  if (devAdmin && (value === devAdmin.email || value === devAdmin.username.toLowerCase())) return devAdmin;
  if (!serviceCredentials()) return null;
  const response = await supabaseRest(`admin_users?select=*&or=(email.eq.${encodeURIComponent(value)},username.eq.${encodeURIComponent(value)})&limit=1`);
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] as AdminUser : null;
}

async function updateAdmin(id: string, patch: Record<string, unknown>) {
  if (id === developmentAdmin()?.id) {
    if (typeof patch.display_name === "string") devState.displayName = patch.display_name;
    if (typeof patch.recovery_email === "string") devState.recoveryEmail = patch.recovery_email;
    if (typeof patch.password_hash === "string") devState.passwordHash = patch.password_hash;
    if (typeof patch.failed_login_attempts === "number") devState.failedLoginAttempts = patch.failed_login_attempts;
    if (typeof patch.locked_until === "string" || patch.locked_until === null) devState.lockedUntil = patch.locked_until;
    if (typeof patch.last_login_at === "string") devState.lastLoginAt = patch.last_login_at;
    if (patch.first_setup_completed === true) devState.firstSetupCompleted = true;
    return;
  }
  await supabaseRest(`admin_users?id=eq.${id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

export async function getAdminSecuritySettings(): Promise<AdminSecuritySettings> {
  if (!serviceCredentials()) return { ...defaultSecuritySettings, email_two_factor_enabled: process.env.ADMIN_DEV_EMAIL_2FA === "true" };
  const response = await supabaseRest("admin_security_settings?id=eq.primary&select=*&limit=1");
  const rows = response.ok ? await response.json() : [];
  return { ...defaultSecuritySettings, ...(Array.isArray(rows) ? rows[0] : null) };
}

export async function verifyAdminPassword(input: {
  identifier: string;
  password: string;
} & LoginContext) {
  const admin = await findAdmin(input.identifier);
  if (!admin) {
    await recordLoginHistory(null, input, "failed", "unknown_admin");
    await auditAdminEvent({ eventType: "admin_login_failed", ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { reason: "invalid credentials" } });
    throw new Error("Invalid admin credentials.");
  }
  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
    await recordLoginHistory(admin, input, "locked", "temporary_lock");
    throw new Error("Admin account is temporarily locked.");
  }
  const validPassword = await bcrypt.compare(input.password, admin.password_hash);
  if (!validPassword) {
    const failed = Number(admin.failed_login_attempts || 0) + 1;
    await updateAdmin(admin.id, {
      failed_login_attempts: failed,
      locked_until: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
    });
    await recordLoginHistory(admin, input, "failed", "invalid_password");
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_login_failed", ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { failed_attempts: failed } });
    throw new Error("Invalid admin credentials.");
  }
  return admin;
}

export async function beginAdminLogin(input: {
  identifier: string;
  password: string;
  rememberDevice: boolean;
} & LoginContext) {
  const admin = await verifyAdminPassword(input);
  const settings = await getAdminSecuritySettings();
  if (!settings.email_two_factor_enabled) return { admin, requiresTwoFactor: false as const };
  if (!serviceCredentials()) throw new Error("Email two-factor authentication requires the configured database and email provider.");

  const challengeToken = randomBytes(32).toString("base64url");
  const code = String(randomInt(100000, 1000000));
  const response = await supabaseRest("admin_login_challenges", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: admin.id,
      challenge_token_hash: hashToken(challengeToken),
      code_hash: await bcrypt.hash(code, 12),
      remember_device: input.rememberDevice,
      ip_address: input.ipAddress,
      user_agent: input.userAgent,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
  });
  if (!response.ok) throw new Error("Unable to create a two-factor challenge.");
  const delivery = await getEmailProvider().send({
    to: admin.email,
    subject: "Your XMASKEDFREAKS administrator verification code",
    text: `Your one-time administrator verification code is ${code}. It expires in 10 minutes and can be used once.`,
    idempotencyKey: `admin-2fa-${hashToken(challengeToken)}`
  });
  if (!delivery.accepted) throw new Error("The verification email could not be accepted by the configured provider. Administrator access remains locked.");
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_2fa_sent", ipAddress: input.ipAddress, userAgent: input.userAgent });
  return { admin, requiresTwoFactor: true as const, challengeToken };
}

export async function completeAdminTwoFactor(input: {
  challengeToken: string;
  code: string;
} & LoginContext) {
  if (!/^\d{6}$/.test(input.code)) throw new Error("Enter the six-digit verification code.");
  const response = await supabaseRest(`admin_login_challenges?select=*&challenge_token_hash=eq.${hashToken(input.challengeToken)}&limit=1`);
  const rows = response.ok ? await response.json() : [];
  const challenge = Array.isArray(rows) ? rows[0] : null;
  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= 5) {
    throw new Error("This verification code is invalid or expired.");
  }
  const valid = await bcrypt.compare(input.code, challenge.code_hash);
  await supabaseRest(`admin_login_challenges?id=eq.${challenge.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(valid ? { used_at: new Date().toISOString() } : { attempts: challenge.attempts + 1 })
  });
  if (!valid) throw new Error("This verification code is invalid or expired.");
  const adminResponse = await supabaseRest(`admin_users?select=*&id=eq.${challenge.admin_user_id}&limit=1`);
  const admins = adminResponse.ok ? await adminResponse.json() : [];
  const admin = Array.isArray(admins) ? admins[0] as AdminUser : null;
  if (!admin) throw new Error("Administrator account is unavailable.");
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_2fa_verified", ipAddress: input.ipAddress, userAgent: input.userAgent });
  return { admin, rememberDevice: challenge.remember_device === true };
}

export async function createAdminSession(admin: AdminUser, ipAddress: string, userAgent: string, rememberDevice = false) {
  if (admin.id === developmentAdmin()?.id) {
    await updateAdmin(admin.id, { failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() });
    return createSignedDevelopmentSession(admin, rememberDevice);
  }
  const settings = await getAdminSecuritySettings();
  const token = randomBytes(32).toString("hex");
  const durationMinutes = rememberDevice ? settings.remember_device_days * 1440 : settings.session_timeout_minutes;
  await supabaseRest("admin_sessions", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: admin.id,
      session_token_hash: hashToken(token),
      ip_address: ipAddress,
      user_agent: userAgent,
      device_hash: deviceHash(userAgent, ipAddress),
      remember_device: rememberDevice,
      last_activity_at: new Date().toISOString(),
      reauthenticated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
    })
  });
  await updateAdmin(admin.id, { failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() });
  await recordLoginHistory(admin, { ipAddress, userAgent }, "success");
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_login_success", ipAddress, userAgent });
  return token;
}

export async function getAdminBySession(token?: string) {
  if (!token && isAdminDevAuthEnabled()) return developmentAdmin();
  if (!token) return null;
  if (token.startsWith("dev.")) return verifySignedDevelopmentSession(token) ? developmentAdmin() : null;
  if (!serviceCredentials()) return null;
  const settings = await getAdminSecuritySettings();
  const response = await supabaseRest(`admin_sessions?select=admin_user_id,expires_at,revoked_at,last_activity_at,reauthenticated_at&session_token_hash=eq.${hashToken(token)}&limit=1`);
  const sessions = response.ok ? await response.json() : [];
  const session = Array.isArray(sessions) ? sessions[0] : null;
  const inactiveAt = session?.last_activity_at ? new Date(session.last_activity_at).getTime() + settings.inactivity_timeout_minutes * 60 * 1000 : 0;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || inactiveAt <= Date.now()) {
    if (session && !session.revoked_at) await revokeAdminSession(token, "expired_or_inactive");
    return null;
  }
  await supabaseRest(`admin_sessions?session_token_hash=eq.${hashToken(token)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ last_activity_at: new Date().toISOString() })
  }).catch(() => undefined);
  const adminResponse = await supabaseRest(`admin_users?select=*&id=eq.${session.admin_user_id}&limit=1`);
  const admins = adminResponse.ok ? await adminResponse.json() : [];
  return Array.isArray(admins) ? admins[0] as AdminUser : null;
}

export async function revokeAdminSession(token: string | undefined, reason = "logout") {
  if (!token) return;
  if (token.startsWith("dev.")) {
    const tokenHash = hashToken(token);
    devRevokedSessions.add(tokenHash);
    devSessionActivity.delete(tokenHash);
    devSessionReauthenticated.delete(tokenHash);
    return;
  }
  if (!serviceCredentials()) return;
  await supabaseRest(`admin_sessions?session_token_hash=eq.${hashToken(token)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString(), revoke_reason: reason })
  });
}

export async function revokeAllAdminSessions(admin: AdminUser, reason = "logout") {
  if (admin.id === developmentAdmin()?.id) {
    for (const tokenHash of devSessionActivity.keys()) devRevokedSessions.add(tokenHash);
    devSessionActivity.clear();
    devSessionReauthenticated.clear();
    return;
  }
  if (!serviceCredentials()) return;
  await supabaseRest(`admin_sessions?admin_user_id=eq.${admin.id}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString(), revoke_reason: reason })
  });
}

export function isSuperAdmin(admin: AdminUser) {
  return admin.is_super_admin === true || admin.role === "SUPER_ADMIN";
}

export async function hasRecentAdminReauthentication(token: string | undefined, maxAgeMinutes = Number(process.env.ADMIN_REAUTH_MAX_MINUTES || 10)) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const maxAgeMs = Math.max(1, Math.min(30, maxAgeMinutes)) * 60 * 1000;
  if (token.startsWith("dev.")) return Date.now() - (devSessionReauthenticated.get(tokenHash) || 0) <= maxAgeMs;
  if (!serviceCredentials()) return false;
  const response = await supabaseRest(`admin_sessions?select=reauthenticated_at,revoked_at,expires_at&session_token_hash=eq.${tokenHash}&limit=1`);
  const rows = response.ok ? await response.json() : [];
  const session = Array.isArray(rows) ? rows[0] : null;
  return Boolean(session && !session.revoked_at && new Date(session.expires_at).getTime() > Date.now() && session.reauthenticated_at && Date.now() - new Date(session.reauthenticated_at).getTime() <= maxAgeMs);
}

export async function reauthenticateAdminSession(input: { token: string | undefined; password: string } & LoginContext) {
  const admin = await getAdminBySession(input.token);
  const valid = Boolean(admin && input.password && await bcrypt.compare(input.password, admin.password_hash));
  await auditAdminEvent({
    adminUserId: admin?.id,
    eventType: valid ? "admin_reauthentication_succeeded" : "admin_reauthentication_failed",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { success: valid, security_classification: "restricted" }
  });
  if (!admin || !valid || !input.token) throw new Error("Reauthentication failed.");
  const tokenHash = hashToken(input.token);
  if (input.token.startsWith("dev.")) devSessionReauthenticated.set(tokenHash, Date.now());
  else {
    const response = await supabaseRest(`admin_sessions?session_token_hash=eq.${tokenHash}&revoked_at=is.null`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ reauthenticated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error("Reauthentication could not be recorded.");
  }
  return admin;
}

export async function completeAdminFirstSetup(input: {
  admin: AdminUser;
  displayName: string;
  recoveryEmail: string;
  currentPassword: string;
  newPassword?: string;
} & LoginContext) {
  if (!input.displayName.trim() || !input.recoveryEmail.includes("@")) throw new Error("Display name and recovery email are required.");
  const verified = await bcrypt.compare(input.currentPassword, input.admin.password_hash);
  if (!verified) throw new Error("Current password could not be verified.");
  if (input.newPassword && input.newPassword.length < 12) throw new Error("The new password must contain at least 12 characters.");
  const rawCodes = Array.from({ length: 10 }, () => randomBytes(5).toString("hex").toUpperCase());
  if (serviceCredentials()) {
    await supabaseRest(`admin_recovery_codes?admin_user_id=eq.${input.admin.id}`, { method: "DELETE" });
    await supabaseRest("admin_recovery_codes", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify(await Promise.all(rawCodes.map(async (code) => ({ admin_user_id: input.admin.id, code_hash: await bcrypt.hash(code, 10) }))))
    });
  }
  await updateAdmin(input.admin.id, {
    display_name: input.displayName.trim(),
    recovery_email: input.recoveryEmail.trim().toLowerCase(),
    first_setup_completed: true,
    password_reset_required: false,
    ...(input.newPassword ? { password_hash: await bcrypt.hash(input.newPassword, 12), password_changed_at: new Date().toISOString() } : {})
  });
  await auditAdminEvent({ adminUserId: input.admin.id, eventType: "admin_first_setup_completed", ipAddress: input.ipAddress, userAgent: input.userAgent });
  return rawCodes;
}

export async function updateAdminTwoFactorSetting(admin: AdminUser, enabled: boolean, context: LoginContext) {
  if (!isSuperAdmin(admin) || !hasAdminPermission(admin, "admin.security.manage")) throw new Error("Super Admin permission is required.");
  if (enabled && (!serviceCredentials() || !emailConfiguration().configured)) {
    throw new Error("Connect the database and email provider before enabling email two-factor authentication.");
  }
  const response = await supabaseRest("admin_security_settings?id=eq.primary", {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ email_two_factor_enabled: enabled, updated_by: admin.id, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error("The two-factor setting could not be stored.");
  await auditAdminEvent({ adminUserId: admin.id, eventType: enabled ? "admin_2fa_enabled" : "admin_2fa_disabled", ipAddress: context.ipAddress, userAgent: context.userAgent });
}

export async function requestAdminPasswordReset(email: string, context: LoginContext) {
  const admin = await findAdmin(email);
  if (!admin || admin.id === developmentAdmin()?.id || !serviceCredentials()) {
    await auditAdminEvent({ eventType: "admin_password_reset_requested", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return;
  }
  const token = randomBytes(32).toString("base64url");
  await supabaseRest("admin_password_reset_events", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      admin_user_id: admin.id,
      email: admin.email,
      requested_ip_address: context.ipAddress,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    })
  });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  await getEmailProvider().send({
    to: admin.recovery_email || admin.email,
    subject: "Reset your XMASKEDFREAKS administrator password",
    text: `Use this single-use link within 30 minutes: ${baseUrl}/admin/reset-password?token=${encodeURIComponent(token)}`,
    idempotencyKey: `admin-reset-${hashToken(token)}`
  });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_password_reset_requested", ipAddress: context.ipAddress, userAgent: context.userAgent });
}

export async function completeAdminPasswordReset(token: string, password: string, context: LoginContext) {
  if (password.length < 12) throw new Error("The new password must contain at least 12 characters.");
  if (!serviceCredentials()) throw new Error("Password reset requires the configured production database.");
  const response = await supabaseRest(`admin_password_reset_events?select=*&token_hash=eq.${hashToken(token)}&limit=1`);
  const rows = response.ok ? await response.json() : [];
  const event = Array.isArray(rows) ? rows[0] : null;
  if (!event || event.completed || !event.expires_at || new Date(event.expires_at).getTime() <= Date.now()) {
    throw new Error("This password reset link is invalid or expired.");
  }
  await updateAdmin(event.admin_user_id, {
    password_hash: await bcrypt.hash(password, 12),
    password_changed_at: new Date().toISOString(),
    failed_login_attempts: 0,
    locked_until: null
  });
  await supabaseRest(`admin_password_reset_events?id=eq.${event.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ completed: true, completed_at: new Date().toISOString() })
  });
  await supabaseRest(`admin_sessions?admin_user_id=eq.${event.admin_user_id}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString(), revoke_reason: "password_reset" })
  });
  await auditAdminEvent({ adminUserId: event.admin_user_id, eventType: "admin_password_reset_completed", ipAddress: context.ipAddress, userAgent: context.userAgent });
}
