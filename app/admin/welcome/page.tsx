import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import FirstAdminSetup from "@/components/admin/FirstAdminSetup";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export const metadata = { title: "Administrator security setup", robots: { index: false, follow: false } };

export default async function AdminWelcomePage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (admin.first_setup_completed) redirect("/admin");
  return (
    <main className="admin-auth-page admin-command-page">
      <section className="admin-auth-panel admin-first-setup">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">Welcome</p>
        <h1>Secure your Control Center</h1>
        <p>Confirm the owner profile, recovery destination, recovery codes, and password posture before entering ADMIN.</p>
        <FirstAdminSetup
          email={admin.email}
          initialDisplayName={admin.display_name || admin.username}
          initialRecoveryEmail={admin.recovery_email || admin.email}
          twoFactorEnabled={admin.two_factor_enabled}
        />
      </section>
    </main>
  );
}
