"use client";

import { useState } from "react";

export default function FirstAdminSetup({
  email,
  initialDisplayName,
  initialRecoveryEmail,
  twoFactorEnabled
}: {
  email: string;
  initialDisplayName: string;
  initialRecoveryEmail: string;
  twoFactorEnabled: boolean;
}) {
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/first-setup", { method: "POST", body: formData });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.message || "Setup could not be completed.");
    setCodes(result.recoveryCodes || []);
    setMessage("Security setup saved. Store these recovery codes before entering ADMIN.");
  }

  return (
    <>
      <div className="admin-security-overview">
        <span>Admin profile<strong>{email}</strong></span>
        <span>Two-factor status<strong>{twoFactorEnabled ? "Enabled" : "Implemented · disabled for development"}</strong></span>
        <span>Password reminder<strong>Changing the development password is recommended before launch</strong></span>
      </div>
      {!codes.length ? (
        <form className="admin-auth-form" action={submit}>
          <label>Display name<input name="displayName" required defaultValue={initialDisplayName} maxLength={64} /></label>
          <label>Recovery email confirmation<input name="recoveryEmail" required type="email" defaultValue={initialRecoveryEmail} /></label>
          <label>Current password<input name="currentPassword" required type="password" autoComplete="current-password" /></label>
          <label>New password <small>(optional during development)</small><input name="newPassword" type="password" minLength={12} autoComplete="new-password" /></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? "Securing account..." : "Generate recovery codes"}</button>
          {message ? <p className="admin-auth-error" role="alert">{message}</p> : null}
        </form>
      ) : (
        <section className="admin-recovery-codes" aria-live="polite">
          <h2>Recovery codes</h2>
          <p>Each code is single-use. They are stored only as secure hashes and will not be displayed again.</p>
          <ol>{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
          <a className="primary admin-link-button" href="/admin">Finish setup</a>
        </section>
      )}
    </>
  );
}
