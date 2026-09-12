"use client";

import { MutableRefObject, useEffect, useRef } from "react";
import { SlitherGameState } from "@/lib/slither/types";
import { useI18n } from "@/components/I18nProvider";

type SlitherMinimapProps = {
  stateRef: MutableRefObject<SlitherGameState | null>;
};

export default function SlitherMinimap({ stateRef }: SlitherMinimapProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let frame = 0;
    function draw() {
      const canvas = canvasRef.current;
      const state = stateRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context && state) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(125,255,155,0.08)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        [state.player, ...state.bots].forEach((snake) => {
          context.fillStyle = snake.palette.primary;
          context.beginPath();
          context.arc((snake.head.x / state.arenaSize.x) * canvas.width, (snake.head.y / state.arenaSize.y) * canvas.height, snake.isPlayer ? 2.2 : 1.4, 0, Math.PI * 2);
          context.fill();
        });
      }
      frame = window.requestAnimationFrame(draw);
    }
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [stateRef]);

  return <canvas className="slither-minimap" width={46} height={32} ref={canvasRef} aria-label={t("gameUi.minimap")} />;
}
