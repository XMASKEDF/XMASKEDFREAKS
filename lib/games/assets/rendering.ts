import type { GameEnvironment, GameRenderableAsset } from "./types";

export function drawEnvironment(context: CanvasRenderingContext2D, width: number, height: number, environment: GameEnvironment, time: number, background?: GameRenderableAsset | null) {
  if (background) {
    const sourceWidth = background instanceof HTMLImageElement ? background.naturalWidth : background.width;
    const sourceHeight = background instanceof HTMLImageElement ? background.naturalHeight : background.height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    context.globalAlpha = 0.72;
    context.drawImage(background, (width - renderedWidth) / 2, (height - renderedHeight) / 2, renderedWidth, renderedHeight);
    context.globalAlpha = 1;
  } else {
    const gradient = context.createRadialGradient(width * 0.46, height * 0.2, 12, width * 0.5, height * 0.45, width * 0.78);
    gradient.addColorStop(0, environment.background[2]);
    gradient.addColorStop(0.5, environment.background[1]);
    gradient.addColorStop(1, environment.background[0]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  context.save();
  context.globalAlpha = environment.gridOpacity;
  context.strokeStyle = environment.accent;
  context.lineWidth = 1;
  const spacing = 52;
  const drift = (time * 8) % spacing;
  for (let x = -spacing + drift; x < width + spacing; x += spacing) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = -spacing + drift * 0.5; y < height + spacing; y += spacing) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  context.globalAlpha = 0.5;
  for (let index = 0; index < environment.particleDensity; index += 1) {
    const x = (index * 137.5 + time * (4 + index % 5)) % width;
    const y = (index * 83.7 + time * (2 + index % 3)) % height;
    const radius = index % 11 === 0 ? 1.7 : 0.7;
    context.fillStyle = index % 7 === 0 ? environment.secondary : environment.accent;
    context.fillRect(x, y, radius, radius);
  }
  context.fillStyle = environment.fog;
  context.fillRect(0, 0, width, height);
  context.restore();
}

export function drawAssetOrFallback(context: CanvasRenderingContext2D, asset: GameRenderableAsset | null | undefined, x: number, y: number, width: number, height: number, rotation: number, fallback: () => void) {
  if (!asset) {
    fallback();
    return;
  }
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.drawImage(asset, -width / 2, -height / 2, width, height);
  context.restore();
}
