import BrandLogo from "@/components/BrandLogo";

export const metadata = {
  title: "Secure access",
  robots: { index: false, follow: false, noarchive: true }
};

export default function AdminLoginPage({
  searchParams
}: {
  searchParams?: { error?: string; logout?: string; setup?: string; reset?: string };
}) {
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-panel">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">Secure gateway</p>
        <h1>Administrator access</h1>
        <p>Authentication and authorization are verified on the server. This session is restricted to approved administrative accounts.</p>
        {searchParams?.error ? <p className="admin-auth-error" role="alert">{searchParams.error}</p> : null}
        {searchParams?.logout ? <p className="status-line" role="status">The server session was revoked and this device was signed out.</p> : null}
        {searchParams?.setup ? <p className="status-line" role="status">The owner account is ready. Sign in to complete the security setup.</p> : null}
        {searchParams?.reset === "requested" ? <p className="status-line" role="status">If the administrator account exists, a secure recovery message has been requested.</p> : null}
        {searchParams?.reset === "complete" ? <p className="status-line" role="status">Password updated. All earlier sessions were revoked.</p> : null}
        <form className="admin-auth-form" action="/api/admin/login" method="post">
          <label>Email or username<input name="identifier" required autoComplete="username" /></label>
          <label>Password<input name="password" required type="password" autoComplete="current-password" /></label>
          <label className="check-row">
            <input name="rememberDevice" type="checkbox" />
            Remember this device
          </label>
          <button className="primary" type="submit">Continue securely</button>
        </form>
        <details className="admin-auth-recovery">
          <summary>Forgot password?</summary>
          <form className="admin-auth-form compact" action="/api/admin/password-reset" method="post">
            <label>Recovery email<input name="email" type="email" required autoComplete="email" /></label>
            <button className="secondary" type="submit">Request secure reset</button>
          </form>
        </details>
      </section>
    </main>
  );
}
