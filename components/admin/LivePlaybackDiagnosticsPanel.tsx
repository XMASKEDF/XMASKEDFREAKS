"use client";

import { useEffect, useState } from "react";
import { LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY, type LivePlaybackDiagnosticSnapshot } from "@/lib/live/playback-diagnostics";

function readSnapshot() {
  try {
    const stored = window.localStorage.getItem(LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY);
    return stored ? JSON.parse(stored) as LivePlaybackDiagnosticSnapshot : null;
  } catch {
    return null;
  }
}

function value(value: number | null, suffix = "") {
  return value === null ? "—" : `${value}${suffix}`;
}

export default function LivePlaybackDiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState<LivePlaybackDiagnosticSnapshot | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readSnapshot());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!snapshot) return <section className="admin-auth-panel"><p className="kicker">DEVELOPMENT DIAGNOSTICS</p><h2>No Live sample yet</h2><p>Open the Live page or the comparison player in another tab. This panel will update without changing playback or contribution state.</p></section>;

  const { lifecycle, playback, network, render, timer, matrix } = snapshot;
  return <>
    <section className="admin-auth-panel" aria-live="polite">
      <header><div><p className="kicker">DEVELOPMENT DIAGNOSTICS</p><h2>Live playback signal</h2><p>Local-only measurements. Source URLs are represented by a one-way identifier and are never stored here.</p></div><span className="admin-health green">OBS → PLAYER</span></header>
      <div className="admin-dashboard-widgets">
        <Metric label="HLS active" value={String(lifecycle.activeHlsInstances)} detail={`Peak ${lifecycle.peakHlsInstances} · ${lifecycle.lastPlaybackMode}`} />
        <Metric label="Source resets" value={String(lifecycle.sourceResets)} detail={`${lifecycle.sourceAssignments} assignments · ${lifecycle.sourceLoads} loads`} />
        <Metric label="Startup" value={value(playback.startupMs, " ms")} detail={`${playback.rebufferCount} rebuffer events`} />
        <Metric label="Buffer ahead" value={value(playback.bufferAheadSeconds, " s")} detail={`ReadyState ${value(playback.readyState)}`} />
        <Metric label="Dropped frames" value={value(playback.droppedFrames)} detail={`of ${value(playback.totalFrames)} total`} />
        <Metric label="API latency" value={value(network.averageLatencyMs, " ms")} detail={`${network.totalRequests} requests · ${network.failedRequests} failed`} />
        <Metric label="Matrix FPS" value={value(matrix.lastFps)} detail={`${value(matrix.lastFrameMs, " ms")} last frame`} />
        <Metric label="Timer drift" value={value(timer.averageDriftMs, " ms")} detail={`Max ${value(timer.maxDriftMs, " ms")}`} />
      </div>
      <p role="status">Last player event: <strong>{playback.lastEvent || "none"}</strong> · stream status events: <strong>{render.streamStatusEvents}</strong> · HLS recoveries: <strong>{lifecycle.hlsRecoveries}</strong> · fatal errors: <strong>{playback.fatalErrorCount}</strong></p>
    </section>
    <section className="admin-auth-panel"><p className="kicker">RECENT REQUESTS</p><h2>Live API chatter</h2>{network.recentRequests.length ? <div className="printify-table-wrap"><table><thead><tr><th>Path</th><th>Result</th><th>Latency</th><th>Time</th></tr></thead><tbody>{network.recentRequests.slice(-12).reverse().map((request) => <tr key={`${request.at}-${request.path}`}><td>{request.path}</td><td>{request.ok ? "200 / OK" : "Failed"}</td><td>{request.latencyMs} ms</td><td>{new Date(request.at).toLocaleTimeString()}</td></tr>)}</tbody></table></div> : <p>No Live API requests have been recorded.</p>}</section>
  </>;
}

function Metric({ label, value: metricValue, detail }: { label: string; value: string; detail: string }) {
  return <article className="admin-dashboard-widget"><span>{label}</span><strong>{metricValue}</strong><small>{detail}</small></article>;
}
