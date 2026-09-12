"use client";

import { useMotionState, type MotionModeSetting } from "@/components/motion/MotionProvider";

export default function MotionPerformancePanel() {
  const { modeSetting, autoMode, effectiveMode, focus, reducedMotion, metrics, backgroundEffectLevel, setModeSetting } = useMotionState();
  const modes: MotionModeSetting[] = ["AUTO", "FULL", "BALANCED", "REDUCED"];
  return <section className="admin-card motion-performance-panel" aria-labelledby="motion-performance-title">
    <header><div><p className="kicker">Performance</p><h2 id="motion-performance-title">Motion / Performance</h2></div><span className="admin-health green">{effectiveMode}</span></header>
    <div className="motion-performance-controls"><label>Admin mode<select value={modeSetting} onChange={(event) => setModeSetting(event.target.value as MotionModeSetting)}>{modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label><p>Automatic: <strong>{autoMode}</strong> · Focus: <strong>{focus}</strong></p></div>
    <dl className="motion-performance-metrics">
      <div><dt>Estimated FPS</dt><dd>{metrics.fps.toFixed(0)}</dd></div><div><dt>Average frame</dt><dd>{metrics.averageFrameTime.toFixed(2)} ms</dd></div><div><dt>Long frames</dt><dd>{metrics.longFrameRate.toFixed(1)}%</dd></div><div><dt>Reduced motion</dt><dd>{reducedMotion ? "On" : "Off"}</dd></div><div><dt>Background effects</dt><dd>{backgroundEffectLevel}</dd></div><div><dt>Visibility</dt><dd>{metrics.visible ? "Active" : "Paused"}</dd></div>
    </dl>
  </section>;
}
