"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProductVariant } from "@/lib/purchase/types";

export default function RestockRequest({ productId, variants = [] }: { productId: string; variants?: ProductVariant[] }) {
  const [email, setEmail] = useState("");
  const [variantId, setVariantId] = useState(variants[0]?.id || "");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  async function submit() {
    setStatus("Saving...");
    let token = "";
    try { token = (await createSupabaseBrowserClient().auth.getSession()).data.session?.access_token || ""; } catch {}
    const response = await fetch("/api/restock", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ productId, variantId: variantId || null, email, consent }) });
    const payload = await response.json() as { error?: string };
    setStatus(payload.error || "We will send one notification when this item returns.");
  }
  return <details className="restock-request"><summary>Notify me when available</summary><div>{variants.length ? <label>Variation<select value={variantId} onChange={(event) => setVariantId(event.target.value)}>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.size || variant.sku}{variant.color ? ` · ${variant.color}` : ""}</option>)}</select></label> : null}<label>Email for logged-out visitors<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label className="check-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Send one restock notification</label><button className="secondary" type="button" disabled={!consent} onClick={() => void submit()}>Save request</button><p role="status">{status}</p></div></details>;
}
