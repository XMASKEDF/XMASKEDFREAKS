export const MATRIX_GLYPHS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ[]{}()/\\<>+-=*#%:;|~^";

export type MatrixGlyphAtlas = {
  canvas: HTMLCanvasElement;
  cellSize: number;
  columns: number;
  rows: number;
};

export function createMatrixGlyphAtlas(characterSize: number, colors = ["#333333", "#666666", "#BFBFBF", "#DCDCDC"], glowStrength = 0): MatrixGlyphAtlas {
  const cellSize = Math.max(10, Math.ceil(characterSize * 1.45));
  const columns = 16;
  const glyphRows = Math.ceil(MATRIX_GLYPHS.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * cellSize;
  canvas.height = glyphRows * colors.length * cellSize;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return { canvas, cellSize, columns, rows: colors.length };
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 ${characterSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  colors.forEach((color, colorRow) => {
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = glowStrength * 12;
    for (let index = 0; index < MATRIX_GLYPHS.length; index += 1) {
      const x = (index % columns) * cellSize + cellSize / 2;
      const y = (colorRow * glyphRows + Math.floor(index / columns)) * cellSize + cellSize / 2;
      context.fillText(MATRIX_GLYPHS[index], x, y);
    }
  });
  context.shadowBlur = 0;
  return { canvas, cellSize, columns, rows: colors.length };
}

export function drawMatrixGlyph(context: CanvasRenderingContext2D, atlas: MatrixGlyphAtlas, glyphIndex: number, colorRow: number, x: number, y: number, size: number) {
  const glyphRows = Math.ceil(MATRIX_GLYPHS.length / atlas.columns);
  const sourceX = (glyphIndex % atlas.columns) * atlas.cellSize;
  const sourceY = (Math.max(0, Math.min(atlas.rows - 1, colorRow)) * glyphRows + Math.floor(glyphIndex / atlas.columns)) * atlas.cellSize;
  context.drawImage(atlas.canvas, sourceX, sourceY, atlas.cellSize, atlas.cellSize, x - size / 2, y - size / 2, size, size);
}
