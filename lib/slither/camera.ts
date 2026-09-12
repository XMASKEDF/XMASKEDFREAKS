import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./constants.ts";
import { clamp } from "./random.ts";
import type { SnakeEntity, Vector } from "./types.ts";

export function dynamicCameraZoom(mass: number, visibleAreaScale = 2.25) {
  const scale = Math.sqrt(clamp(visibleAreaScale, 1, 3));
  return clamp((1.18 - mass / 420) / scale, 0.72 / scale, 1.14 / scale);
}

export function getCamera(player: SnakeEntity, arena: Vector, zoom: number) {
  const viewWidth = CANVAS_WIDTH / zoom;
  const viewHeight = CANVAS_HEIGHT / zoom;
  return {
    x: clamp(player.head.x - viewWidth / 2, 0, arena.x - viewWidth),
    y: clamp(player.head.y - viewHeight / 2, 0, arena.y - viewHeight),
    width: viewWidth,
    height: viewHeight,
    zoom
  };
}
