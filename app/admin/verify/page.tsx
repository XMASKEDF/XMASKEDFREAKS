import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { adminChallengeCookie } from "@/lib/admin-auth";

export const metadata = { title: "Verify access", robots: { index: false, follow: false } };

export default function AdminVerifyPage({ searchParams }: { searchParams?: { error?: string } }) {
  if (!cookies().get(adminChallengeCookie)?.value) redirect("/admin/login");
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-panel">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">Two-factor authentication</p>
        <h1>Check your administrator email</h1>
        <p>Enter the single-use six-digit code. The code expires after ten minutes and locks after repeated failures.</p>
        {searchParams?.error ? <p className="admin-auth-error" role="alert">{searchParams.error}</p> : null}
        <form className="admin-auth-form" action="/api/admin/verify" method="post">
          <label>Verification code<input name="code" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} /></label>
          <button className="primary" type="submit">Verify and enter</button>
        </form>
        <a className="secondary admin-link-button" href="/admin/login">Cancel</a>
      </section>
    </main>
  );
}
