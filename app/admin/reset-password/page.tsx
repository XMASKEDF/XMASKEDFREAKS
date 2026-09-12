import BrandLogo from "@/components/BrandLogo";

export const metadata = { title: "Reset secure access", robots: { index: false, follow: false } };

export default function AdminResetPasswordPage({
  searchParams
}: {
  searchParams?: { token?: string; error?: string };
}) {
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-panel">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">Account recovery</p>
        <h1>Set a new administrator password</h1>
        <p>The recovery link is single-use and expires after 30 minutes. Completing it revokes every existing administrator session.</p>
        {searchParams?.error ? <p className="admin-auth-error" role="alert">{searchParams.error}</p> : null}
        <form className="admin-auth-form" action="/api/admin/password-reset" method="post">
          <input type="hidden" name="token" value={searchParams?.token || ""} />
          <label>New password<input name="password" required type="password" minLength={12} autoComplete="new-password" /></label>
          <button className="primary" type="submit" disabled={!searchParams?.token}>Reset password</button>
        </form>
      </section>
    </main>
  );
}
