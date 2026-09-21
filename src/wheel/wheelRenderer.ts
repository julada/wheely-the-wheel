import type { Slice } from "./layouts";

export const DEFAULT_PALETTE = ["#f4c542", "#ff6b6b", "#35d0c0", "#8b7fd6", "#f2905a", "#4fb0e0"];

/** Picks black or white label text, whichever contrasts better against a given hex fill,
 *  using the standard relative-luminance formula — needed once palettes can include dark fills. */
export function labelColorFor(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#12101c";
  let h = m[1] ?? "";
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#12101c" : "#ffffff";
}

/** Raw canvas + geometry a piece of paint code needs — no assumptions about what gets drawn
 *  with it. A spin variant can use this to call paintWheel below, or ignore it and draw
 *  something that isn't a wedge-per-name wheel at all. */
export interface WheelGeometry {
  ctx: CanvasRenderingContext2D;
  size: number;
  center: number;
  radius: number;
  palette: string[];
}

/**
 * Paints the classic wedge-per-name wheel face from a set of slice boundaries. This is a
 * plain function, not something every frame is forced through: it's the standard look most
 * variants want, available to call, but a variant free to draw its own thing (move the canvas,
 * skip wedges entirely, whatever) never has to touch it.
 *
 * winnerIndex/emphasis: an optional visual pulse (glow + bigger label) on one slice, e.g. to
 * sell a variant's build-up to its winner. emphasis 0 = no pulse, 1 = fully emphasized.
 */
export function paintWheel(geo: WheelGeometry, names: string[], slices: Slice[], winnerIndex = 0, emphasis = 0): void {
  const { ctx, size, center, radius, palette } = geo;
  const n = names.length;
  ctx.clearRect(0, 0, size, size);

  if (n === 0) {
    ctx.fillStyle = "#1c1830";
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a79bcf";
    ctx.font = "600 22px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add some names to begin", center, center);
    return;
  }

  for (let i = 0; i < n; i++) {
    const isWinner = i === winnerIndex;
    const slice = slices[i];
    if (!slice) continue;
    const { start, end } = slice;
    const width = end - start;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    const fill = palette[i % palette.length] ?? "#f4c542";
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(18,16,28,0.6)";
    ctx.stroke();
    if (isWinner && emphasis > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 * emphasis;
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
    }

    // label
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + width / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = labelColorFor(fill);
    const baseFontSize = n > 20 ? 14 : n > 12 ? 18 : 24;
    const fontSize = isWinner ? baseFontSize * (1 + 0.3 * emphasis) : baseFontSize;
    ctx.font = `800 ${fontSize}px -apple-system, sans-serif`;
    const maxChars = n > 20 ? 10 : n > 12 ? 14 : 20;
    const rawLabel = names[i] ?? "";
    const label = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + "…" : rawLabel;
    ctx.fillText(label, radius - 18, 0);
    ctx.restore();
  }
}

/** Owns the wheel canvas's geometry/palette and paints the plain wedge wheel onto it — used
 *  for WheelApp's own idle-state rendering (names/palette edits, mid-drag). Spin variants do
 *  not go through this class; they get a WheelGeometry directly (see RenderElements) and call
 *  paintWheel themselves, or not, as they choose. */
export class WheelRenderer {
  readonly size: number;
  readonly center: number;
  readonly radius: number;
  private readonly ctx: CanvasRenderingContext2D;
  private palette: string[] = DEFAULT_PALETTE;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.size = canvas.width;
    this.center = this.size / 2;
    this.radius = this.size / 2 - 6;
  }

  /** Swaps the segment color cycle. Falls back to the default palette if given an empty list. */
  setPalette(colors: string[]): void {
    this.palette = colors.length > 0 ? colors : DEFAULT_PALETTE;
  }

  /** The geometry/palette bundle handed to a spin variant's renderFrame. */
  get geometry(): WheelGeometry {
    return { ctx: this.ctx, size: this.size, center: this.center, radius: this.radius, palette: this.palette };
  }

  draw(names: string[], slices: Slice[], winnerIndex = 0, emphasis = 0): void {
    paintWheel(this.geometry, names, slices, winnerIndex, emphasis);
  }
}
