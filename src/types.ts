import type { WheelGeometry } from "./wheel/wheelRenderer";

export type SpinVariant = "classic" | "grow" | "centrifuge";

/** Exact closed-form trajectory for a quadratic-drag + rolling-friction spindown. */
export interface SpindownParams {
  k1: number;
  k2: number;
  wc: number;
  theta0: number;
  tStop: number;
  total: number;
}

export interface SpindownSample {
  theta: number;
  omega: number;
}

/** Everything a plugin needs at the moment of release to decide how the spin unfolds. */
export interface SpinReleaseContext {
  names: string[];
  releaseOmega: number; // signed rad/s measured from the drag gesture
  direction: 1 | -1;
  /** The default quadratic-drag trajectory computed from releaseOmega — most plugins reuse
   *  this untouched; a plugin is free to return a different trajectory entirely. */
  baseTrajectory: SpindownParams;
  currentRotation: number;
  pointerAngle: number;
}

/** What a plugin decides at release time: the trajectory to actually animate, and which name
 *  (if any) it lands on. winnerIndex is null for a release too gentle to count as a fair spin. */
export interface PreparedSpin {
  trajectory: SpindownParams;
  winnerIndex: number | null;
}

/** Current simulation state, handed to renderFrame every animation frame. */
export interface SpinFrameState {
  t: number;
  theta: number;
  omega: number;
  done: boolean;
  names: string[];
  winnerIndex: number | null;
}

export interface SpinFinishContext {
  names: string[];
  winnerIndex: number;
}

/** Raw DOM/canvas handles a plugin's renderFrame needs to take full control of a frame's
 *  presentation — including moving the wheel itself, not just redrawing its face. Extends
 *  WheelGeometry (ctx + size/center/radius/palette) so a plugin can pass `els` straight into
 *  wheel/wheelRenderer.ts's paintWheel if it wants the standard wedge look, or ignore it and
 *  draw directly on `ctx` (or move `wheelCanvas`/`wheelFrame`) for something else entirely —
 *  there is no method every frame is forced to go through. */
export interface RenderElements extends WheelGeometry {
  wheelCanvas: HTMLCanvasElement;
  wheelFrame: HTMLElement;
  confettiCanvas: HTMLCanvasElement;
}

/** One selectable finish for the spin. Owns everything variant-specific: how the release
 *  becomes a trajectory + winner, how every frame is drawn, and any custom finish beat before
 *  the shared shake/confetti/fanfare sequence runs. */
export interface SpinVariantPlugin {
  id: SpinVariant;
  label: string;

  prepareSpin(ctx: SpinReleaseContext): PreparedSpin;

  /** Full control over this frame's presentation. Every plugin should render from
   *  wheel/layouts.ts's baseSlices(n) unless it has a specific reason to diverge, so every
   *  variant starts from the same evenly-distributed wheel and only departs from it
   *  deliberately.
   *
   *  If this frame's slices are NOT the uniform 2π/n grid (e.g. a widened/locked slice), return
   *  the index of whichever slice the pointer is currently over — the caller uses this instead of
   *  its own uniform-grid math to decide when to click/kick the flapper, so a pointer that's
   *  deliberately being kept inside one slice (see Growing Field) doesn't generate phantom
   *  boundary-crossing ticks. Return void/undefined while this frame's layout is still the
   *  uniform grid, so the caller falls back to its own calculation. */
  renderFrame(els: RenderElements, state: SpinFrameState): number | void;

  onFinish?(ctx: SpinFinishContext): void | Promise<void>;
}
