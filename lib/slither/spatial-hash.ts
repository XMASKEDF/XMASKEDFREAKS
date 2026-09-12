import { Vector } from "./types";

export type SpatialEntry<T> = {
  point: Vector;
  item: T;
};

export class SpatialHash<T> {
  private cells = new Map<string, SpatialEntry<T>[]>();

  constructor(private readonly cellSize: number) {}

  private key(point: Vector) {
    return `${Math.floor(point.x / this.cellSize)}:${Math.floor(point.y / this.cellSize)}`;
  }

  insert(point: Vector, item: T) {
    const key = this.key(point);
    const bucket = this.cells.get(key) || [];
    bucket.push({ point, item });
    this.cells.set(key, bucket);
  }

  nearby(point: Vector, radius: number) {
    const minX = Math.floor((point.x - radius) / this.cellSize);
    const maxX = Math.floor((point.x + radius) / this.cellSize);
    const minY = Math.floor((point.y - radius) / this.cellSize);
    const maxY = Math.floor((point.y + radius) / this.cellSize);
    const results: SpatialEntry<T>[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const bucket = this.cells.get(`${x}:${y}`);
        if (bucket) results.push(...bucket);
      }
    }
    return results;
  }
}
