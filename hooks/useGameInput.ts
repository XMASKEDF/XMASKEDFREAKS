"use client";

import { useCallback, useRef } from "react";
import { SlitherInputState, Vector } from "@/lib/slither/types";

const EMPTY_INPUT: SlitherInputState = {
  pointer: null,
  keyboardTurn: 0,
  boost: false
};

export function useGameInput() {
  const inputRef = useRef<SlitherInputState>({ ...EMPTY_INPUT });

  const setPointer = useCallback((nextPointer: Vector) => {
    inputRef.current = { ...inputRef.current, pointer: nextPointer };
  }, []);

  const clearPointer = useCallback(() => {
    inputRef.current = { ...inputRef.current, pointer: null, boost: false };
  }, []);

  const setBoost = useCallback((boost: boolean) => {
    inputRef.current = { ...inputRef.current, boost };
  }, []);

  return {
    inputRef,
    setPointer,
    clearPointer,
    setBoost
  };
}
