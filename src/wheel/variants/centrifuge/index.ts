import { baseSlices } from "../../layouts";
import { labelColorFor, paintWheel } from "../../wheelRenderer";
import type { PreparedSpin, RenderElements, SpinVariantPlugin } from "../../../types";
import { computeLandingSpin } from "../landing";

// As with Growing Field, the effect tracks the wheel's CURRENT angular speed every frame, not
// elapsed time — at this speed or above nothing has flown yet, easing in continuously as the
// wheel loses momentum and reaching full flung-out right as it stops. Since a spindown's omega
// only ever decreases, this ratchets up on its own without needing separate ratchet state.
const FLYOUT_TRIGGER_OMEGA = 5.0; // rad/s

/** Ease-out: quick initial flight that tails off, closer to how a flung object actually looks
 *  than a linear or ease-in slide would. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) ** 2;
}

/** Reads the wheel canvas's current spin angle straight off its own CSS transform (the app
 *  spins the canvas by setting `transform: rotate(...)`, not by redrawing rotated geometry) —
 *  the one number the overlay needs to keep a flung wedge lined up with the wheel it left. */
function currentWheelRotation(wheelCanvas: HTMLCanvasElement): number {
  const m = /rotate\(([-\d.eE]+)rad\)/.exec(wheelCanvas.style.transform);
  return m ? Number(m[1]) : 0;
}

function paintWinnerDisc(els: RenderElements, names: string[], winnerIndex: number, t: number): void {
  const { ctx, size, center, radius, palette } = els;
  ctx.clearRect(0, 0, size, size);
  const n = names.length;
  if (n === 0) return;

  // The winner has been a full circle behind everyone else since frame one — there's nothing
  // to grow, only to uncover as the wedges stacked on top of it fly away.
  const fill = palette[winnerIndex % palette.length] ?? "#f4c542";
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(18,16,28,0.6)";
  ctx.stroke();

  const segAngle = (Math.PI * 2) / n;
  const winnerCenterAngle = winnerIndex * segAngle + segAngle / 2;
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(winnerCenterAngle);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = labelColorFor(fill);
  const baseFontSize = n > 20 ? 14 : n > 12 ? 18 : 24;
  ctx.font = `800 ${baseFontSize * (1 + 0.3 * t)}px -apple-system, sans-serif`;
  const maxChars = n > 20 ? 10 : n > 12 ? 14 : 20;
  const rawLabel = names[winnerIndex] ?? "";
  const label = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + "…" : rawLabel;
  ctx.fillText(label, radius - 18, 0);
  ctx.restore();
}

/** Flings every losing wedge onto the fullscreen confetti overlay instead of the wheel's own
 *  (circularly clipped) canvas, so it stays visible past the wheel's edge — all the way out to
 *  wherever it actually leaves the browser viewport, rather than vanishing the instant it
 *  crosses the wheel's round frame.
 *
 *  `frozenRotation` is a spin-lifetime ref: while a wedge is still attached (t=0) it needs to
 *  keep tracking the wheel's live spin like everything else on it, but the instant it breaks
 *  away it should stop being carried around by a rotation it's no longer part of — a flung
 *  object doesn't keep orbiting the thing that flung it. So the wheel's rotation at the exact
 *  frame t first goes positive is captured once (by the caller, into this ref) and reused for
 *  every frame after. */
function paintFlungWedges(els: RenderElements, names: string[], winnerIndex: number, t: number, frozenRotation: { current: number | null }): void {
  const { confettiCanvas, wheelCanvas, size, center, radius, palette } = els;
  const octx = confettiCanvas.getContext("2d");
  if (!octx) return;
  octx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  if (t >= 1) return;

  const n = names.length;
  const wheelRect = wheelCanvas.getBoundingClientRect();
  const cx = wheelRect.left + wheelRect.width / 2;
  const cy = wheelRect.top + wheelRect.height / 2;
  // offsetWidth is the pre-transform layout size, unlike getBoundingClientRect (which balloons
  // once the canvas is mid-rotation) — the right thing to scale wheel-local units by.
  const scale = wheelCanvas.offsetWidth / size;

  if (t > 0 && frozenRotation.current === null) {
    frozenRotation.current = currentWheelRotation(wheelCanvas);
  }
  const rotation = t > 0 ? (frozenRotation.current ?? currentWheelRotation(wheelCanvas)) : currentWheelRotation(wheelCanvas);

  // Flung far enough that every wedge clears the farthest viewport corner from wherever the
  // wheel happens to sit, so "flies out of the window" means the actual browser window.
  const maxScreenDist = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) * 1.15;
  const flyDist = (maxScreenDist / scale) * t;

  const segAngle = (Math.PI * 2) / n;
  const baseFontSize = n > 20 ? 14 : n > 12 ? 18 : 24;
  const maxChars = n > 20 ? 10 : n > 12 ? 14 : 20;

  for (let i = 0; i < n; i++) {
    if (i === winnerIndex) continue;
    const start = i * segAngle;
    const end = start + segAngle;
    const mid = start + segAngle / 2;
    const fill = palette[i % palette.length] ?? "#f4c542";

    octx.save();
    // Place the overlay's origin at the wheel's screen center, matching its current spin angle
    // and display scale, then fly the wedge outward in the wheel's own (unrotated) coordinate
    // frame — same wedge-drawing code as paintWheel from here on, just re-anchored.
    octx.translate(cx, cy);
    octx.rotate(rotation);
    octx.scale(scale, scale);
    octx.translate(Math.cos(mid) * flyDist, Math.sin(mid) * flyDist);
    octx.translate(-center, -center);

    octx.beginPath();
    octx.moveTo(center, center);
    octx.arc(center, center, radius, start, end);
    octx.closePath();
    octx.fillStyle = fill;
    octx.fill();
    octx.lineWidth = 3;
    octx.strokeStyle = "rgba(18,16,28,0.6)";
    octx.stroke();

    octx.translate(center, center);
    octx.rotate(mid);
    octx.textAlign = "right";
    octx.textBaseline = "middle";
    octx.fillStyle = labelColorFor(fill);
    octx.font = `800 ${baseFontSize}px -apple-system, sans-serif`;
    const rawI = names[i] ?? "";
    const labelI = rawI.length > maxChars ? rawI.slice(0, maxChars - 1) + "…" : rawI;
    octx.fillText(labelI, radius - 18, 0);
    octx.restore();
  }
}

/** "Centrifuge": as the wheel loses speed, every losing wedge is hurled outward past the wheel's
 *  edge and off the screen, revealing that one randomly chosen wedge was a full circle sitting
 *  behind them the whole time. frozenRotation is decided once a spin actually starts flinging
 *  wedges and read back every frame after — safe as closure state because only one spin
 *  animates at a time (see Growing Field's growthTarget for the same pattern). */
function createCentrifugeVariant(): SpinVariantPlugin {
  const frozenRotation: { current: number | null } = { current: null };

  return {
    id: "centrifuge",
    label: "Centrifuge",

    prepareSpin(ctx): PreparedSpin {
      frozenRotation.current = null;
      const landing = computeLandingSpin(ctx);
      if (!landing) return { trajectory: ctx.baseTrajectory, winnerIndex: null };
      return { trajectory: landing.trajectory, winnerIndex: landing.winnerIndex };
    },

    renderFrame(els, state): number | void {
      const n = state.names.length;
      if (state.winnerIndex === null) {
        paintWheel(els, state.names, baseSlices(n), 0, 0);
        return;
      }
      const linearT = Math.max(0, Math.min(1, 1 - state.omega / FLYOUT_TRIGGER_OMEGA));
      const t = easeOutQuad(linearT);
      paintWinnerDisc(els, state.names, state.winnerIndex, t);
      paintFlungWedges(els, state.names, state.winnerIndex, t, frozenRotation);
      // Once wedges start flying (t>0) the main canvas is just the winner's full-circle disc —
      // there's no segment grid left for the pointer to cross, so freeze on the winner from here
      // on instead of letting the caller's uniform-grid math keep firing on a layout that no
      // longer exists.
      if (linearT > 0) return state.winnerIndex;
    },
  };
}

export const centrifugeVariant: SpinVariantPlugin = createCentrifugeVariant();
