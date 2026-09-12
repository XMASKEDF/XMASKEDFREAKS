"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Participant = {
  subject_ref: string;
  display_name: string;
  identity_type: "user" | "guest";
  status: string;
  last_seen_at: string;
};

type Block = {
  id: string;
  subject_ref: string;
  display_name: string;
  reason: string;
  active: boolean;
  blocked_until: string | null;
};

type Comment = {
  id: string;
  display_name: string;
  body: string;
  status: string;
  created_at: string;
};

type AdminChatResponse = { configured?: boolean; participants?: Participant[]; blocks?: Block[]; comments?: Comment[]; error?: string };

export default function AdminChatManagement() {
  const [data, setData] = useState<AdminChatResponse>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "recent" | "blocked" | "guest" | "user">("all");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/live-chat?sessionId=daily-live&environment=production", { cache: "no-store" }).catch(() => null);
    const next = await response?.json().catch(() => ({})) as AdminChatResponse;
    setData(next);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function decide(action: "block" | "unblock", participant: { subject_ref: string; display_name: string }, permanent = false) {
    setBusy(`${action}:${participant.subject_ref}`);
    const response = await fetch("/api/admin/live-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, liveSessionId: "daily-live", environment: "production", subjectRef: participant.subject_ref, displayName: participant.display_name, permanent, reason: "Manual Admin chat decision." })
    }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as AdminChatResponse;
    setBusy("");
    setMessage(response?.ok ? "Manual chat decision saved and audit logged." : result.error || "Chat decision failed.");
    if (response?.ok) void load();
  }

  const activeBlocks = (data.blocks || []).filter((block) => block.active && (!block.blocked_until || new Date(block.blocked_until).getTime() > Date.now()));
  const visibleParticipants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const now = Date.now();
    return (data.participants || []).filter((participant) => {
      const blocked = activeBlocks.some((block) => block.subject_ref === participant.subject_ref);
      const lastSeen = new Date(participant.last_seen_at).getTime();
      const present = participant.status === "present" && Number.isFinite(lastSeen) && now - lastSeen <= 45_000;
      const recent = Number.isFinite(lastSeen) && now - lastSeen <= 15 * 60_000;
      const matchesFilter = filter === "all" || (filter === "present" && present) || (filter === "recent" && recent && !present)
        || (filter === "blocked" && blocked) || (filter === participant.identity_type);
      return matchesFilter && (!needle || participant.display_name.toLowerCase().includes(needle));
    });
  }, [activeBlocks, data.participants, filter, search]);
  const presentCount = (data.participants || []).filter((participant) => participant.status === "present" && Date.now() - new Date(participant.last_seen_at).getTime() <= 45_000).length;
  const guestCount = (data.participants || []).filter((participant) => participant.identity_type === "guest").length;
  const userCount = (data.participants || []).filter((participant) => participant.identity_type === "user").length;
  return (
    <div className="admin-chat-management">
      <section className="admin-ops-card">
        <header><p className="kicker">MANUAL PARTICIPATION CONTROL</p><h2>Live participants</h2><p>Only recent participant markers are shown. No email addresses or private account fields are displayed.</p></header>
        {message ? <p className="admin-inline-status" role="status">{message}</p> : null}
        <div className="admin-ops-summary"><strong>{presentCount} current</strong><span>{guestCount} guests</span><span>{userCount} users</span><span>{activeBlocks.length} blocked</span></div>
        <div className="admin-ops-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or guest name" aria-label="Search chat participants" /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter chat participants"><option value="all">All</option><option value="present">Currently present</option><option value="recent">Recently active</option><option value="blocked">Blocked</option><option value="guest">Guests</option><option value="user">Users</option></select></div>
        <div className="admin-ops-table">
          {visibleParticipants.map((participant) => {
            const blocked = activeBlocks.some((block) => block.subject_ref === participant.subject_ref);
            const lastSeen = new Date(participant.last_seen_at).getTime();
            const presence = participant.status === "present" && Date.now() - lastSeen <= 45_000 ? "present" : participant.status === "left" ? "disconnected" : "recently active";
            return <article key={participant.subject_ref}><strong>{participant.display_name}</strong><span>{participant.identity_type} · {presence} · last seen {new Date(participant.last_seen_at).toLocaleString()}</span><div>{blocked ? <button className="secondary" type="button" disabled={busy.length > 0} onClick={() => void decide("unblock", participant)}>Unblock</button> : <><button className="secondary" type="button" disabled={busy.length > 0} onClick={() => void decide("block", participant)}>Block 24h</button><button className="secondary danger" type="button" disabled={busy.length > 0} onClick={() => void decide("block", participant, true)}>Block permanently</button></>}</div></article>;
          })}
          {!visibleParticipants.length ? <p>{data.configured === false ? "Chat storage is not configured yet." : "No matching chat participants."}</p> : null}
        </div>
      </section>
      <section className="admin-ops-card">
        <header><p className="kicker">PUBLIC FEED REVIEW</p><h2>Recent comments</h2><p>Tip events remain financially authoritative and are shown separately from visitor comments.</p></header>
        <div className="admin-ops-table">{(data.comments || []).slice(0, 40).map((comment) => <article key={comment.id}><strong>{comment.display_name}</strong><span>{comment.status} · {new Date(comment.created_at).toLocaleString()}</span><p>{comment.body}</p></article>)}{!data.comments?.length ? <p>No comments recorded yet.</p> : null}</div>
      </section>
      <section className="admin-ops-card">
        <header><p className="kicker">ACTIVE MANUAL DECISIONS</p><h2>Chat blocks</h2></header>
        <div className="admin-ops-table">{activeBlocks.map((block) => <article key={block.id}><strong>{block.display_name}</strong><span>{block.blocked_until ? `until ${new Date(block.blocked_until).toLocaleString()}` : "permanent"}</span><p>{block.reason}</p></article>)}{!activeBlocks.length ? <p>No active manual chat blocks.</p> : null}</div>
      </section>
    </div>
  );
}
