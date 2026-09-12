"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameTuning } from "@/hooks/useGameTuning";
import { gameMixLevel } from "@/lib/games/audio";

export type GameSound = "collect" | "power" | "hit" | "shield" | "life" | "level" | "gameover" | "click";

const TONES: Record<GameSound, [number, number, OscillatorType]> = {
  collect: [620, 0.055, "sine"], power: [330, 0.18, "triangle"], hit: [150, 0.11, "square"],
  shield: [880, 0.12, "sine"], life: [520, 0.28, "triangle"], level: [740, 0.32, "triangle"],
  gameover: [110, 0.42, "sawtooth"], click: [430, 0.045, "sine"]
};

export function useGameAudio(muted: boolean) {
  const tuning = useGameTuning();
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => () => { void contextRef.current?.close(); }, []);

  return useCallback((sound: GameSound) => {
    if (muted || tuning.gameVolume <= 0 || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = contextRef.current || new AudioContextClass();
    contextRef.current = context;
    let gain = gainRef.current;
    if (!gain) {
      gain = context.createGain();
      gain.connect(context.destination);
      gainRef.current = gain;
    }
    if (context.state === "suspended") void context.resume();
    const liveMuted = localStorage.getItem("xmf-live-muted") === "true";
    const liveVolume = Math.min(1, Math.max(0, Number(localStorage.getItem("xmf-live-volume") || 1)));
    const level = gameMixLevel(tuning.gameVolume, liveVolume, liveMuted);
    const [frequency, duration, type] = TONES[sound];
    const oscillator = context.createOscillator();
    const voice = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.72), context.currentTime + duration);
    voice.gain.setValueAtTime(Math.max(0.0001, level), context.currentTime);
    voice.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(voice);
    voice.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, [muted, tuning.gameVolume]);
}
