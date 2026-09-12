"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";

export default function PurchaseModalShell({ title, subtitle, children, onClose, headerAside, className = "" }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; headerAside?: ReactNode; className?: string }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []) as HTMLElement[];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keydown); };
  }, [mounted, onClose]);

  if (!mounted) return null;
  return createPortal(<div className="purchase-modal-backdrop">
    <div className={`purchase-modal ${className}`.trim()} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="purchase-modal-header"><span className="purchase-cart-mark" aria-hidden="true">⌁</span><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{subtitle}</p></div>{headerAside ? <div className="purchase-modal-header-aside">{headerAside}</div> : null}<button className="purchase-modal-close" type="button" aria-label={t("purchase.close")} onClick={onClose}>×</button></header>
      {children}
    </div>
  </div>, document.body);
}
