"use client";

import { useMemo, useState } from "react";
import type { UpdateRegistryPackage, UpdateStatus } from "@/lib/admin-update-registry";

const statusOptions: Array<"ALL" | UpdateStatus> = [
  "ALL",
  "PLANNED",
  "IN PROGRESS",
  "TESTING",
  "COMPLETE",
  "NEEDS INFRASTRUCTURE",
  "BLOCKED"
];

const accessGroups = [
  {
    title: "Content and storefronts",
    links: [
      ["Products and MERCH", "/admin/merch"],
      ["Printify management", "/admin/printify"],
      ["Orders and inventory", "/admin/orders"],
      ["Audio Clips", "/admin/audio-clips"],
      ["Upcoming", "/admin/catalog"],
      ["Feet", "/admin/feet"],
      ["Paintings", "/admin/paintings"],
      ["Media library", "/admin/media"]
    ]
  },
  {
    title: "Live and audience",
    links: [
      ["Live Control Room", "/admin/live"],
      ["Live configuration", "/admin#streaming"],
      ["Wallet and coin packages", "/admin#wallet"],
      ["Tips and live wallet", "/admin/tips"],
      ["Earnings analytics", "/admin/analytics/earnings"],
      ["Traffic analytics", "/admin/analytics/traffic"],
      ["Customer preview", "/admin#admin-workspace"]
    ]
  },
  {
    title: "System operations",
    links: [
      ["Admin operationalization", "/admin/operationalization"],
      ["Infrastructure status", "/admin/system/infrastructure"],
      ["Reliability Center", "/admin/reliability"],
      ["Security Center", "/admin/security"],
      ["System settings", "/admin"],
      ["Sandbox", "/sandbox"]
    ]
  }
] as const;

function statusClass(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

export default function UpdateControl({ packages }: { packages: UpdateRegistryPackage[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | UpdateStatus>("ALL");
  const visiblePackages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return packages.filter((item) => {
      const matchesStatus = status === "ALL" || item.status === status;
      const searchable = [item.title, item.area, item.description, ...item.files, ...item.items.map((child) => child.title)].join(" ").toLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [packages, query, status]);

  return (
    <div className="admin-update-control">
      <section className="admin-card admin-update-access" aria-labelledby="development-access-title">
        <header>
          <div>
            <p className="kicker">OWNER WORKSPACE</p>
            <h2 id="development-access-title">Development access map</h2>
            <p>The existing protected <strong>/admin</strong> command center is the owner entry point for the Codex development workspace.</p>
          </div>
          <span className="update-environment-badge">SANDBOX / LOCAL</span>
        </header>
        <div className="admin-access-groups">
          {accessGroups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <nav aria-label={group.title}>
                {group.links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
              </nav>
            </section>
          ))}
        </div>
        <p className="admin-update-note">Customer Preview remains a separate visitor-facing iframe. It does not share Admin credentials, privileges, or session state.</p>
      </section>

      <section className="admin-card admin-update-registry" aria-labelledby="change-control-title">
        <div className="admin-update-toolbar">
          <div>
            <p className="kicker">CHANGE CONTROL</p>
            <h2 id="change-control-title">Update Control</h2>
            <p>Review implementation history separately from the security and operations audit record.</p>
          </div>
          <div className="admin-update-filters">
            <label>Search updates<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registry" /></label>
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | UpdateStatus)}>{statusOptions.map((option) => <option value={option} key={option}>{option === "ALL" ? "All statuses" : option}</option>)}</select></label>
          </div>
        </div>
        <div className="admin-update-list">
          {visiblePackages.length === 0 ? <p>No updates match the current filters.</p> : visiblePackages.map((item) => (
            <article className="admin-update-package" key={item.id}>
              <header className="admin-update-package-header">
                <div><p className="kicker">{item.area}</p><h3>{item.title}</h3><p>{item.description}</p></div>
                <span className={`update-status update-status-${statusClass(item.status)}`}>{item.status}</span>
              </header>
              <div className="admin-update-meta">
                <span>Recorded<strong>{formatDate(item.recordedAt)} UTC</strong></span>
                <span>Scope<strong>{item.classifications.join(" / ")}</strong></span>
                <span>Environment<strong>{item.environment}</strong></span>
              </div>
              <p><strong>Testing:</strong> {item.testingStatus}</p>
              {item.knownIssue ? <p><strong>Known issue:</strong> {item.knownIssue}</p> : null}
              <p><strong>Rollback note:</strong> {item.rollbackNote}</p>
              <div className="admin-update-items"><h4>Change items</h4>{item.items.map((child) => <div className="admin-update-item" key={child.id}><span className={`update-item-status update-item-${statusClass(child.status)}`}>{child.status}</span><div><strong>{child.title}</strong><p>{child.description}</p><small>{child.files.join(" · ")}</small></div></div>)}</div>
              <details className="admin-update-files"><summary>Affected files <span>({item.files.length})</span></summary><ul>{item.files.map((file) => <li key={file}>{file}</li>)}</ul></details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
