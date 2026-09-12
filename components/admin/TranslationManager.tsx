"use client";

import { useEffect, useMemo, useState } from "react";
import { formatLanguageLabel, type LocaleOption } from "@/lib/i18n";

type TranslationEntry = { translation_key: string; locale: string; value: string; status: string; updated_at: string };
type MissingEntry = { translation_key: string; locale: string; route: string; created_at: string };

export default function TranslationManager() {
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [missing, setMissing] = useState<MissingEntry[]>([]);
  const [locale, setLocale] = useState("es");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading translation data…");
  const [importPreview, setImportPreview] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    fetch("/api/admin/translations", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load translations");
      return response.json() as Promise<{ locales: LocaleOption[]; entries: TranslationEntry[]; missing: MissingEntry[] }>;
    }).then((data) => {
      setLocales(data.locales); setEntries(data.entries); setMissing(data.missing); setStatus("Ready");
    }).catch(() => setStatus("Translation storage is unavailable until Supabase is configured."));
  }, []);

  const filtered = useMemo(() => entries.filter((entry) => {
    const matchLocale = !locale || entry.locale === locale;
    const matchQuery = !query || `${entry.translation_key} ${entry.value}`.toLowerCase().includes(query.toLowerCase());
    return matchLocale && matchQuery;
  }), [entries, locale, query]);

  async function save() {
    setStatus("Saving…");
    const response = await fetch("/api/admin/translations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, locale, value, status: "published" }) });
    if (!response.ok) { setStatus("Save failed. Check the translation key and database connection."); return; }
    setEntries((items) => [...items.filter((item) => !(item.translation_key === key && item.locale === locale)), { translation_key: key, locale, value, status: "published", updated_at: new Date().toISOString() }]);
    setStatus("Published. Visitors receive the update on their next language refresh.");
  }

  function download(format: "json" | "csv") {
    const selected = entries.filter((entry) => entry.locale === locale);
    const content = format === "json"
      ? JSON.stringify(Object.fromEntries(selected.map((entry) => [entry.translation_key, entry.value])), null, 2)
      : ["key,value", ...selected.map((entry) => `${JSON.stringify(entry.translation_key)},${JSON.stringify(entry.value)}`)].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv" }));
    anchor.download = `translations-${locale}.${format}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function previewImport(file: File) {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    const valid = Object.entries(parsed).filter((entry): entry is [string, string] => /^[a-zA-Z0-9_.-]+$/.test(entry[0]) && typeof entry[1] === "string");
    setImportPreview(valid);
    setStatus(`Import preview ready: ${valid.length} valid entries. Review the count, then apply.`);
  }

  async function applyImport() {
    setStatus(`Publishing ${importPreview.length} reviewed entries…`);
    for (const [entryKey, entryValue] of importPreview) {
      await fetch("/api/admin/translations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: entryKey, locale, value: entryValue, status: "published" }) });
    }
    setStatus(`Imported ${importPreview.length} translations. Reload to review the complete list.`);
    setImportPreview([]);
  }

  return (
    <section className="admin-auth-panel translation-manager">
      <div><p className="kicker">ADMIN · LOCALIZATION</p><h1>Translation Manager</h1><p role="status">{status}</p></div>
      <div className="admin-command-toolbar">
        <label>Language<select value={locale} onChange={(event) => setLocale(event.target.value)}>{locales.map((item) => <option value={item.code} key={item.code}>{formatLanguageLabel(item.nativeName, item.name)}</option>)}</select></label>
        <label>Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Key or translated text" /></label>
      </div>
      <div className="admin-status-strip"><span>Published overrides<strong>{filtered.length}</strong></span><span>Missing reports<strong>{missing.filter((item) => item.locale === locale).length}</strong></span><span>Direction<strong>{locales.find((item) => item.code === locale)?.direction || "ltr"}</strong></span></div>
      <div className="admin-quick-actions"><button className="secondary" type="button" onClick={() => download("json")}>Export JSON</button><button className="secondary" type="button" onClick={() => download("csv")}>Export CSV</button><label className="secondary admin-link-button">Preview JSON import<input type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewImport(file); }} /></label>{importPreview.length ? <button className="primary" type="button" onClick={() => void applyImport()}>Apply {importPreview.length} translations</button> : null}</div>
      <div className="translation-editor">
        <label>Translation key<input value={key} onChange={(event) => setKey(event.target.value)} placeholder="tipMenu.send" /></label>
        <label>Translated value<textarea value={value} onChange={(event) => setValue(event.target.value)} rows={4} /></label>
        <button className="primary" type="button" disabled={!key.trim() || !value.trim()} onClick={save}>Publish translation</button>
      </div>
      <div className="admin-control-grid">
        {filtered.slice(0, 80).map((entry) => <button className="admin-control-card translation-entry" type="button" key={`${entry.locale}-${entry.translation_key}`} onClick={() => { setKey(entry.translation_key); setValue(entry.value); }}><small>{entry.locale} · {entry.status}</small><strong>{entry.translation_key}</strong><span>{entry.value}</span></button>)}
      </div>
    </section>
  );
}
