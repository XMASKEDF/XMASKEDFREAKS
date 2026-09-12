import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminSecurityPanel from "@/components/admin/AdminSecurityPanel";
import EmergencyMaintenancePanel from "@/components/admin/EmergencyMaintenancePanel";
import SecurityCenterOverview from "@/components/admin/SecurityCenterOverview";
import {
  adminSessionCookie,
  getAdminBySession,
  getAdminSecuritySettings,
  hasAdminPermission
} from "@/lib/admin-auth";
import { getStoredBotDetectionConfig } from "@/lib/infrastructure/bot-policy";

export default async function AdminSecurityPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.security.manage")) redirect("/admin");
  const settings = await getAdminSecuritySettings();
  const botDetectionConfig = await getStoredBotDetectionConfig();
  return (
    <main className="admin-page admin-security-page">
      <header className="admin-header">
        <BrandLogo href="/admin" priority />
        <div>
          <p className="kicker">ADMIN · Security</p>
          <h1>Authentication & Access</h1>
          <p>Session policy, email verification, owner recovery, role permissions, login history, and audit evidence.</p>
        </div>
        <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
      </header>
      <AdminSecurityPanel
        initialTwoFactorEnabled={settings.email_two_factor_enabled}
        sessionTimeoutMinutes={settings.session_timeout_minutes}
        inactivityTimeoutMinutes={settings.inactivity_timeout_minutes}
        rememberDeviceDays={settings.remember_device_days}
        lastLoginAt={admin.last_login_at || null}
        initialBotDetectionConfig={botDetectionConfig}
      />
      <SecurityCenterOverview />
      <EmergencyMaintenancePanel />
    </main>
  );
}
