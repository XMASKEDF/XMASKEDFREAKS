import { Vector } from "./types";

export type AmbientParticle = {
  id: number;
  position: Vector;
  radius: number;
  color: string;
  drift: Vector;
};

const COLORS = ["rgba(125,255,155,0.44)", "rgba(168,85,247,0.38)", "rgba(98,221,255,0.38)", "rgba(228,180,93,0.34)"];

export function createAmbientParticles(count: number, width: number, height: number): AmbientParticle[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    position: { x: Math.random() * width, y: Math.random() * height },
    radius: 0.8 + Math.random() * 2.1,
    color: COLORS[id % COLORS.length],
    drift: { x: -0.2 + Math.random() * 0.4, y: -0.2 + Math.random() * 0.4 }
  }));
}

export function drawAmbientParticles(
  context: CanvasRenderingContext2D,
  particles: AmbientParticle[],
  camera: { x: number; y: number; width: number; height: number },
  time: number,
  reducedGlow: boolean
) {
  particles.forEach((particle) => {
    const x = ((particle.position.x + particle.drift.x * time * 8 - camera.x * 0.18) % camera.width + camera.width) % camera.width;
    const y = ((particle.position.y + particle.drift.y * time * 8 - camera.y * 0.18) % camera.height + camera.height) % camera.height;
    context.fillStyle = particle.color;
    context.shadowColor = reducedGlow ? "transparent" : particle.color;
    context.shadowBlur = reducedGlow ? 0 : 8;
    context.beginPath();
    context.arc(x, y, particle.radius, 0, Math.PI * 2);
    context.fill();
  });
  context.shadowBlur = 0;
}
