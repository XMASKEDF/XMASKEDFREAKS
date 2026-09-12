import BrandLogo from "@/components/BrandLogo";
import { getAdminCount } from "@/lib/admin-auth";
import { notFound } from "next/navigation";

export default async function AdminSetupPage() {
  let locked = true;
  let setupReady = Boolean(process.env.ADMIN_SETUP_SECRET);
  try {
    locked = (await getAdminCount()) > 0;
  } catch {
    setupReady = false;
  }

  if (locked) {
    notFound();
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-panel">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">First-time admin setup</p>
        <h1>Create the owner administrator</h1>
        <p>This page only works before the first admin exists. The setup secret is verified server-side against <code>ADMIN_SETUP_SECRET</code>.</p>
        {!setupReady ? <p className="warning">Server setup secret or Supabase service credentials are missing.</p> : null}
        <form className="admin-auth-form" action="/api/admin/setup" method="post">
          <label>Username<input name="username" required minLength={3} maxLength={32} autoComplete="username" /></label>
          <label>Email<input name="email" required type="email" autoComplete="email" /></label>
          <label>Password<input name="password" required type="password" minLength={12} autoComplete="new-password" /></label>
          <label>Setup secret<input name="setupSecret" required type="password" autoComplete="off" /></label>
          <button className="primary" type="submit">Create first admin</button>
        </form>
      </section>
    </main>
  );
}
