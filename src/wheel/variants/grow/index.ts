import { baseSlices } from "../../layouts";
import type { Slice } from "../../layouts";
import { paintWheel } from "../../wheelRenderer";
import type { PreparedSpin, SpinVariantPlugin } from "../../../types";
import { computeLandingSpin } from "../landing";

// How widened the winning slice gets tracks the wheel's CURRENT angular speed every frame, not
// elapsed time since some threshold — at this speed or above there's no growth at all. Once
// speed drops below this, growth locks on (see createGrowVariant) and stays locked for the rest
// of the spin, however far that turns out to be.
const GROWTH_TRIGGER_OMEGA = 1.0; // rad/s

// The leading edge tracks the pointer's live position but stays this far ahead of it (as a
// fraction of one segment's width) rather than sitting exactly on top of it — a hairline gap so
// the pointer visibly has room inside the field instead of riding its exact boundary.
const LEAD_GAP_FRACTION = 0.05;

function normalize(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}

/** Which slice growth locked onto, which of its two edges is doing the moving, and enough of the
 *  lock-time state to keep tracking the live pointer angle in the same (potentially unwrapped)
 *  coordinate frame as the slice's fixed nominal edges — see wrapOffset below. */
interface LockedGrowth {
  index: number;
  /** "start" grows by extending the slice's start edge backward (spin direction +1: the pointer
   *  sweeps toward decreasing wheel-local angle, so what it's approaching is the start edge);
   *  "end" grows forward for the opposite spin direction. */
  growingEdge: "start" | "end";
  nominalStart: number;
  nominalEnd: number;
  /** Converts a raw (unwrapped) live pointer angle into the same coordinate frame nominalStart/
   *  nominalEnd live in, without ever normalizing it back into [0, 2*PI) — the field's moving
   *  edge has to be free to sweep past that seam without jumping. */
  wrapOffset: number;
}

/** Redistributes the other slices' widths evenly around whatever room a widened slice
 *  [start, end) leaves behind — same shape every variant's paintWheel expects. */
function slicesAround(n: number, index: number, start: number, end: number): Slice[] {
  const width = end - start;
  const otherWidth = n > 1 ? (Math.PI * 2 - width) / (n - 1) : Math.PI * 2;
  const slices: Slice[] = new Array(n);
  let cursor = start;
  for (let k = 0; k < n; k++) {
    const i = (index + k) % n;
    const w = i === index ? width : otherWidth;
    slices[i] = { start: cursor, end: cursor + w };
    cursor += w;
  }
  return slices;
}

/** "Growing Field": once the wheel is slow enough, whichever slice the pointer is resting on
 *  locks in as the one that grows. From then on its trailing edge (the one the pointer already
 *  swept past) stays fixed and keeps rotating normally with the wheel, exactly like every other
 *  slice's boundary — but its leading edge (the one the pointer hasn't reached yet) stops being
 *  fixed to the wheel at all and instead is redrawn every frame at the pointer's own current
 *  position (plus a small gap), so it moves at exactly the wheel's angular speed. Something
 *  moving at the pointer's own speed can never be caught by the pointer, so the pointer can never
 *  cross into the next slice for as long as growth stays active — the field's width is simply
 *  whatever gap has opened between the fixed trailing edge and the pointer-chasing leading edge,
 *  not an eased blend toward some precomputed target. Because the leading edge tracks the real
 *  live position the whole time, it's automatically wherever the wheel actually stops, too — no
 *  separate correctness guarantee needed. */
function createGrowVariant(): SpinVariantPlugin {
  let releaseAngle = 0;
  let releaseRotation = 0;
  let direction: 1 | -1 = 1;
  let locked: LockedGrowth | null = null;

  return {
    id: "grow",
    label: "Growing Field",

    prepareSpin(ctx): PreparedSpin {
      releaseAngle = ctx.pointerAngle;
      releaseRotation = ctx.currentRotation;
      direction = ctx.direction;
      locked = null;
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
      const segAngle = (Math.PI * 2) / n;
      // theta is the signed delta rotation since release, so releaseRotation + theta is the
      // wheel's absolute rotation this frame; releaseAngle minus that gives the wheel-local
      // angle (the frame slices are defined in) currently sitting under the fixed physical
      // pointer — left unwrapped here on purpose (see wrapOffset).
      const rawLiveAngle = releaseAngle - (releaseRotation + state.theta);

      if (locked === null && state.omega < GROWTH_TRIGGER_OMEGA) {
        const normalized = normalize(rawLiveAngle);
        const index = Math.floor(normalized / segAngle) % n;
        const nominalStart = index * segAngle;
        const nominalEnd = nominalStart + segAngle;
        locked = {
          index,
          growingEdge: direction === 1 ? "start" : "end",
          nominalStart,
          nominalEnd,
          wrapOffset: normalized - rawLiveAngle,
        };
      }

      if (locked === null) {
        paintWheel(els, state.names, baseSlices(n), 0, 0);
        return;
      }

      const gap = segAngle * LEAD_GAP_FRACTION;
      const liveAngle = rawLiveAngle + locked.wrapOffset;
      let start = locked.nominalStart;
      let end = locked.nominalEnd;
      if (locked.growingEdge === "start") {
        start = Math.min(locked.nominalStart, liveAngle - gap);
      } else {
        end = Math.max(locked.nominalEnd, liveAngle + gap);
      }

      const width = end - start;
      const emphasis = Math.max(0, Math.min(1, width / segAngle - 1));
      const slices = slicesAround(n, locked.index, start, end);
      paintWheel(els, state.names, slices, locked.index, emphasis);
      // The growing slice's leading edge is redrawn every frame to stay just ahead of the
      // pointer, so by construction the pointer never actually crosses out of it while locked —
      // report the same fixed index for as long as that holds, instead of letting the caller's
      // uniform-grid math see rotation sweep past segment-sized boundaries that aren't real here.
      return locked.index;
    },
  };
}

export const growVariant = createGrowVariant();
