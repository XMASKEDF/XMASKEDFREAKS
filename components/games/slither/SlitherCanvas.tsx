"use client";

import { MutableRefObject, PointerEvent, useEffect, useRef } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/slither/constants";
import { dynamicCameraZoom, getCamera } from "@/lib/slither/camera";
import { createAmbientParticles, drawAmbientParticles } from "@/lib/slither/particles";
import { snakeRadius } from "@/lib/slither/snake";
import { SlitherGameState, Vector } from "@/lib/slither/types";
import { gameAssetManager } from "@/lib/games/assets/asset-manager";
import { massToLength } from "@/lib/games/mechanics";
import { drawEnvironment } from "@/lib/games/assets/rendering";
import { useGameAssets } from "@/lib/games/assets/use-game-assets";
import type { GameRenderableAsset } from "@/lib/games/assets/types";
import { useGameTuning } from "@/hooks/useGameTuning";

type SlitherCanvasProps = {
  stateRef: MutableRefObject<SlitherGameState | null>;
  reducedGlow: boolean;
  onPointerMove: (point: Vector) => void;
  onPointerLeave: () => void;
  onBoostChange: (boosting: boolean) => void;
};

function drawSnake(context: CanvasRenderingContext2D, state: SlitherGameState, snake: SlitherGameState["player"], reducedGlow: boolean, assets: Record<string, GameRenderableAsset | null>, cameraScale: number) {
  const camera = getCamera(state.player, state.arenaSize, dynamicCameraZoom(state.player.mass, cameraScale));
  context.save();
  context.translate(-camera.x, -camera.y);
  const radius = snakeRadius(snake);
  const bodySlot: Record<string, string> = { "xmf-green": "snake-body", "crimson-heat": "snake-body-red", "electric-blue": "snake-body-blue", "violet-pulse": "snake-body-purple", "gold-rush": "snake-body-red", "arctic-white": "snake-body-blue", "sunset-gradient": "snake-body-purple" };
  snake.trail.forEach((point, index) => {
    const alpha = Math.max(0.2, 1 - index / Math.max(1, snake.trail.length));
    context.globalAlpha = alpha;
    context.fillStyle = index % 2 ? snake.palette.secondary : snake.palette.primary;
    if (!reducedGlow) {
      context.shadowColor = snake.palette.glow;
      context.shadowBlur = index < 8 ? 14 : 6;
    }
    const segmentRadius = Math.max(2.4, radius * (1 - index / snake.trail.length * 0.52));
    const body = index === snake.trail.length - 1 ? assets["snake-tail"] : assets[bodySlot[snake.palette.id] || "snake-body-black"];
    if (body) {
      const previous = snake.trail[Math.max(0, index - 1)] || snake.head;
      const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
      context.save(); context.translate(point.x, point.y); context.rotate(angle - Math.PI / 2); context.drawImage(body, -segmentRadius, -segmentRadius, segmentRadius * 2, segmentRadius * 2); context.restore();
    } else {
      context.beginPath(); context.arc(point.x, point.y, segmentRadius, 0, Math.PI * 2); context.fill();
    }
  });
  context.globalAlpha = 1;
  const headSlot: Record<string, string> = { "xmf-green": "snake-head", "crimson-heat": "snake-head-red", "electric-blue": "snake-head-blue", "violet-pulse": "snake-head-purple", "gold-rush": "snake-head-gold", "arctic-white": "snake-head-blue", "sunset-gradient": "snake-head-gold" };
  const head = assets[headSlot[snake.palette.id] || "snake-head-black"];
  if (head) {
    const breathe = 1 + Math.sin(state.elapsedSeconds * 8 + snake.head.x * 0.01) * 0.045;
    context.save(); context.translate(snake.head.x, snake.head.y); context.rotate(snake.direction - Math.PI / 2); context.drawImage(head, -radius * 1.25 * breathe, -radius * 1.38 * breathe, radius * 2.5 * breathe, radius * 2.76 * breathe); context.restore();
  }
  const eyes = assets["snake-eyes"];
  if (eyes) {
    context.save(); context.translate(snake.head.x, snake.head.y); context.rotate(snake.direction - Math.PI / 2); context.drawImage(eyes, -radius * 1.05, -radius * 1.05, radius * 2.1, radius * 2.1); context.restore();
  }
  context.fillStyle = "#050505";
  context.shadowBlur = 0;
  if (!eyes) {
    context.beginPath();
    context.arc(snake.head.x + Math.cos(snake.direction - 0.45) * radius * 0.58, snake.head.y + Math.sin(snake.direction - 0.45) * radius * 0.58, 1.7, 0, Math.PI * 2);
    context.arc(snake.head.x + Math.cos(snake.direction + 0.45) * radius * 0.58, snake.head.y + Math.sin(snake.direction + 0.45) * radius * 0.58, 1.7, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export default function SlitherCanvas({ stateRef, reducedGlow, onPointerMove, onPointerLeave, onBoostChange }: SlitherCanvasProps) {
  const assetPack = useGameAssets("slither");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef(createAmbientParticles(42, CANVAS_WIDTH, CANVAS_HEIGHT));
  const imagesRef = useRef<Record<string, GameRenderableAsset | null>>({});
  const tuning = useGameTuning();

  useEffect(() => {
    if (!assetPack) return;
    let active = true;
    Promise.all(assetPack.slots.filter((slot) => slot.kind === "image").map(async (slot) => [slot.id, await gameAssetManager.loadSlot(assetPack, slot.id)] as const)).then((entries) => {
      if (active) imagesRef.current = Object.fromEntries(entries);
    });
    return () => { active = false; };
  }, [assetPack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(CANVAS_WIDTH, Math.round(rect.width * ratio));
      canvas.height = Math.max(CANVAS_HEIGHT, Math.round(rect.height * ratio));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  function pointerToWorld(event: PointerEvent<HTMLCanvasElement>) {
    const state = stateRef.current;
    if (!state) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = getCamera(state.player, state.arenaSize, dynamicCameraZoom(state.player.mass, tuning.maskedUpCameraScale));
    return {
      x: camera.x + ((event.clientX - rect.left) / rect.width) * camera.width,
      y: camera.y + ((event.clientY - rect.top) / rect.height) * camera.height
    };
  }

  function movePointer(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointerToWorld(event);
    if (point) onPointerMove(point);
  }

  useEffect(() => {
    let frame = 0;
    function draw() {
      const canvas = canvasRef.current;
      const state = stateRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context && state) {
        if (process.env.NODE_ENV !== "production") {
          canvas.dataset.phase = state.phase;
          canvas.dataset.score = String(state.score);
          canvas.dataset.length = String(massToLength(state.player.mass));
          canvas.dataset.playerX = String(Math.round(state.player.head.x));
          canvas.dataset.playerY = String(Math.round(state.player.head.y));
        }
        const camera = getCamera(state.player, state.arenaSize, dynamicCameraZoom(state.player.mass, tuning.maskedUpCameraScale));
        context.setTransform(canvas.width / CANVAS_WIDTH, 0, 0, canvas.height / CANVAS_HEIGHT, 0, 0);
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const environment = assetPack?.environments.find((item) => item.id === assetPack.activeEnvironment) || assetPack?.environments[0];
        if (environment) drawEnvironment(context, CANVAS_WIDTH, CANVAS_HEIGHT, environment, performance.now() / 1000, imagesRef.current["background-primary"]);
        else { context.fillStyle = "#030504"; context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); }
        drawAmbientParticles(context, particlesRef.current, camera, performance.now() / 1000, reducedGlow);
        context.save();
        context.translate(-camera.x, -camera.y);
        context.strokeStyle = "rgba(125,255,155,0.055)";
        context.lineWidth = 1;
        const firstHexX = Math.floor((camera.x - 60) / 42) * 42;
        const firstHexY = Math.floor((camera.y - 60) / 36) * 36;
        for (let x = firstHexX; x < camera.x + camera.width + 60; x += 42) {
          for (let y = firstHexY; y < camera.y + camera.height + 60; y += 36) {
            context.beginPath();
            for (let side = 0; side < 6; side += 1) {
              const angle = Math.PI / 3 * side;
              const px = x + Math.cos(angle) * 16;
              const py = y + Math.sin(angle) * 16;
              if (side === 0) context.moveTo(px, py);
              else context.lineTo(px, py);
            }
            context.closePath();
            context.stroke();
          }
        }
        context.strokeStyle = "rgba(125,255,155,0.22)";
        context.lineWidth = 2;
        context.strokeRect(8, 8, state.arenaSize.x - 16, state.arenaSize.y - 16);
        state.food.forEach((pellet) => {
          const rareFood = pellet.value > 2 ? imagesRef.current["food-rare"] : null;
          if (rareFood) { const pulse = 1 + Math.sin(performance.now() / 130 + pellet.position.x) * 0.16; const size = pellet.radius * 3.2 * pulse; context.drawImage(rareFood, pellet.position.x - size / 2, pellet.position.y - size / 2, size, size); return; }
          context.fillStyle = pellet.color;
          context.shadowColor = reducedGlow ? "transparent" : pellet.color;
          context.shadowBlur = reducedGlow ? 0 : 8;
          context.beginPath();
          context.arc(pellet.position.x, pellet.position.y, pellet.radius, 0, Math.PI * 2);
          context.fill();
        });
        context.restore();
        [...state.bots, state.player].forEach((snake) => {
          if (snake.alive) drawSnake(context, state, snake, reducedGlow, imagesRef.current, tuning.maskedUpCameraScale);
        });
        if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("debugCollisions")) {
          context.save(); context.translate(-camera.x, -camera.y); context.strokeStyle = "#7dff9b"; context.lineWidth = 1;
          [...state.bots, state.player].filter((snake) => snake.alive).forEach((snake) => {
            context.beginPath(); context.arc(snake.head.x, snake.head.y, snakeRadius(snake), 0, Math.PI * 2); context.stroke();
          });
          context.restore();
        }
        context.shadowBlur = 0;
        context.fillStyle = "rgba(125,255,155,0.75)";
        context.fillText(state.message, 8, CANVAS_HEIGHT - 8);
      }
      frame = window.requestAnimationFrame(draw);
    }
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [assetPack, reducedGlow, stateRef, tuning.maskedUpCameraScale]);

  return (
    <canvas
      className="slither-canvas"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      ref={canvasRef}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        movePointer(event);
        onBoostChange(true);
      }}
      onPointerMove={movePointer}
      onPointerUp={() => {
        onBoostChange(false);
        onPointerLeave();
      }}
      onPointerLeave={() => {
        onBoostChange(false);
        onPointerLeave();
      }}
      onPointerCancel={() => {
        onBoostChange(false);
        onPointerLeave();
      }}
      aria-label="MASKED UP gameplay canvas"
    />
  );
}
