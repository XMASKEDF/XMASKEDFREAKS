"use client";

import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { isEditableTarget } from "@/lib/games/mechanics";
import { GAME_KEYS } from "@/lib/games/input";

export type ArcadeInputState = {
  keys: Set<string>;
  pointerDown: boolean;
  pointerX: number;
  pointerY: number;
};

export function clearArcadeInput(input: ArcadeInputState) {
  input.keys.clear();
  input.pointerDown = false;
}

export function useArcadeInput(
  containerRef: RefObject<HTMLElement>,
  onPause?: () => void
): { inputRef: MutableRefObject<ArcadeInputState>; focused: boolean; activate: () => void; clear: () => void } {
  const inputRef = useRef<ArcadeInputState>({ keys: new Set(), pointerDown: false, pointerX: 0, pointerY: 0 });
  const pauseRef = useRef(onPause);
  const [focused, setFocused] = useState(false);

  useEffect(() => { pauseRef.current = onPause; }, [onPause]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const active = () => container === document.activeElement || container.contains(document.activeElement);
    const keyDown = (event: KeyboardEvent) => {
      if (!active() || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!GAME_KEYS.has(key)) return;
      event.preventDefault();
      if ((key === "p" || key === "escape") && !event.repeat) pauseRef.current?.();
      inputRef.current.keys.add(key);
    };
    const keyUp = (event: KeyboardEvent) => inputRef.current.keys.delete(event.key.toLowerCase());
    const blur = () => { clearArcadeInput(inputRef.current); setFocused(false); };
    const visibilityChange = () => { if (document.visibilityState === "hidden") blur(); };
    const focus = () => setFocused(true);
    const pointerDown = (event: PointerEvent) => {
      container.focus({ preventScroll: true });
      inputRef.current.pointerDown = true;
      inputRef.current.pointerX = event.clientX;
      inputRef.current.pointerY = event.clientY;
      setFocused(true);
    };
    const pointerMove = (event: PointerEvent) => {
      inputRef.current.pointerX = event.clientX;
      inputRef.current.pointerY = event.clientY;
    };
    const pointerUp = () => { inputRef.current.pointerDown = false; };

    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibilityChange);
    container.addEventListener("focus", focus);
    container.addEventListener("blur", blur);
    container.addEventListener("pointerdown", pointerDown);
    container.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    return () => {
      clearArcadeInput(inputRef.current);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibilityChange);
      container.removeEventListener("focus", focus);
      container.removeEventListener("blur", blur);
      container.removeEventListener("pointerdown", pointerDown);
      container.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
    };
  }, [containerRef]);

  const activate = useCallback(() => containerRef.current?.focus({ preventScroll: true }), [containerRef]);
  const clear = useCallback(() => clearArcadeInput(inputRef.current), []);

  return {
    inputRef,
    focused,
    activate,
    clear
  };
}
