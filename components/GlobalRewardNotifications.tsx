"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";

type RewardEvent = {
  id: string;
  name: string;
  amount: number;
  coins?: number;
  label: string;
  emoji?: string;
  animation?: string;
  color?: string;
  durationSeconds?: number;
  sound?: string;
  createdAt: string;
};

function money(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function RewardCoinIcon() {
  return <Image className="coin-icon" src="/branding/green-coin.png" alt="" aria-hidden="true" width={64} height={64} />;
}

export default function GlobalRewardNotifications() {
  const pathname = usePathname();
  const [events, setEvents] = useState<RewardEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const soundContextRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((sound = "ching") => {
    try {
      if (sound === "off" || localStorage.getItem("xmf-live-muted") === "true") return;
      const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = soundContextRef.current || new AudioContextClass();
      soundContextRef.current = context;
      const now = context.currentTime;
      const tones: Record<string, number[]> = {
        ching: [880, 1320, 1760],
        bell: [660, 990, 660],
        pulse: [420, 620, 840],
        arcade: [740, 988, 1175, 1568]
      };
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = 0.15;
      compressor.threshold.value = -20;
      compressor.knee.value = 24;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.16;
      master.connect(compressor).connect(context.destination);
      const wave = sound === "pulse" ? "sine" : "triangle";
      (tones[sound] || tones.ching).forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.11, now + index * 0.045 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.045 + 0.24);
        oscillator.connect(gain).connect(master);
        oscillator.start(now + index * 0.045);
        oscillator.stop(now + index * 0.045 + 0.26);
      });
    } catch {
      // Reward audio is optional; visual notifications still deliver.
    }
  }, []);

  const receiveRewardEvent = useCallback((event: RewardEvent) => {
    if (!event?.id || seenRef.current.has(event.id)) return;
    seenRef.current.add(event.id);
    setEvents((items) => [event, ...items].slice(0, 4));
    playSound(event.sound);
    window.setTimeout(() => {
      setEvents((items) => items.filter((item) => item.id !== event.id));
    }, Math.max(3, Math.min(20, Number(event.durationSeconds || 10))) * 1000);
  }, [playSound]);

  useEffect(() => {
    const onReward = (event: Event) => receiveRewardEvent((event as CustomEvent<RewardEvent>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "xmaskedfreaks-global-reward-event" || !event.newValue) return;
      try {
        receiveRewardEvent(JSON.parse(event.newValue) as RewardEvent);
      } catch {
        // Ignore malformed cross-tab reward payloads.
      }
    };
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("xmaskedfreaks-rewards") : null;
    channel?.addEventListener("message", (event) => receiveRewardEvent(event.data as RewardEvent));
    window.addEventListener("xmaskedfreaks:reward", onReward);
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.close();
      window.removeEventListener("xmaskedfreaks:reward", onReward);
      window.removeEventListener("storage", onStorage);
    };
  }, [receiveRewardEvent]);

  useEffect(() => {
    if (pathname !== "/live") return;
    let active = true;
    const loadPublicTips = async () => {
      const response = await fetch("/api/live-tip-events", { cache: "no-store" }).catch(() => null);
      if (!active || !response?.ok) return;
      const payload = await response.json().catch(() => ({ events: [] })) as { events?: Array<{ id: string; displayName: string; coins: number; message?: string; createdAt: string }> };
      for (const event of [...(payload.events || [])].reverse()) {
        receiveRewardEvent({
          id: event.id,
          name: event.displayName || "Guest",
          amount: 0,
          coins: event.coins,
          label: event.message || `tipped ${event.coins} coins`,
          emoji: "💰",
          animation: "slide",
          durationSeconds: 10,
          sound: "ching",
          createdAt: event.createdAt
        });
      }
    };
    void loadPublicTips();
    const timer = window.setInterval(() => void loadPublicTips(), 6_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pathname, receiveRewardEvent]);

  return (
    <div className="tip-toast-area global-reward-area" aria-live="polite">
      {events.map((event) => (
        <div
          className={`tip-toast reward-${event.animation || "slide"}`}
          key={event.id}
          style={{
            "--reward-color": event.color || "#7dff9b",
            "--reward-duration": `${Math.max(3, Math.min(20, Number(event.durationSeconds || 10)))}s`
          } as CSSProperties}
        >
          <span>{event.emoji || "💰"}</span>
          <strong>{event.name}</strong>
          <em><span className="coin-value"><RewardCoinIcon /><span>{Number(event.coins || 0).toLocaleString()} coins</span></span>{event.amount > 0 ? <> · {money(event.amount)}</> : null} · {event.label}</em>
        </div>
      ))}
    </div>
  );
}
