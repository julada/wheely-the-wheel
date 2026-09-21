import { spindownForTotal, totalForSpindown } from "../../physics/spindown";
import type { SpindownParams, SpinReleaseContext } from "../../types";

// A release needs to carry at least this much angular speed to count as a deliberate,
// committed spin that gets to land on a winner. Anything gentler still spins down with the
// same physics — it just isn't forced to land anywhere in particular.
export const FAIR_MIN_OMEGA = 2.0; // rad/s

function normalize(a: number): number {
  const twoPi = Math.PI * 2;
  return ((a % twoPi) + twoPi) % twoPi;
}

export interface LandingSpin {
  trajectory: SpindownParams;
  winnerIndex: number;
  winnerPointAngle: number;
}

/** Shared release-to-landing math for every variant that wants to land precisely on a random
 *  winner using the default quadratic-drag trajectory: picks a winner, a landing point inside
 *  its slice, and the exact whole-turn-plus-remainder distance that lands there. Returns null
 *  for a release too gentle to count as a fair, committed spin. */
export function computeLandingSpin(ctx: SpinReleaseContext): LandingSpin | null {
  const n = ctx.names.length;
  const speed = Math.abs(ctx.releaseOmega);
  if (n < 2 || speed < FAIR_MIN_OMEGA) return null;

  const segAngle = (Math.PI * 2) / n;
  const winnerIndex = Math.floor(Math.random() * n);

  // land somewhere inside the segment, not always dead-center
  const landSpread = segAngle * 0.7;
  const landOffset = (segAngle - landSpread) / 2 + Math.random() * landSpread;
  const winnerPointAngle = winnerIndex * segAngle + landOffset;

  const currentMod = normalize(ctx.currentRotation);
  const requiredMod = normalize(ctx.pointerAngle - winnerPointAngle);
  // The minimal same-direction rotation (in [0, 2π)) that lands on the target, measured
  // forwards or backwards depending on which way the release is sending the wheel.
  const effectiveDelta = ctx.direction > 0 ? normalize(requiredMod - currentMod) : normalize(currentMod - requiredMod);

  // Distance under this drag model grows only logarithmically with launch speed, so forcing a
  // turn count unrelated to k1/k2 can demand a distance that's only reachable at absurd launch
  // speeds. Instead, see how far the actual release speed would naturally carry the wheel, and
  // pick the nearest whole-turn landing to THAT distance.
  const { k1, k2 } = ctx.baseTrajectory;
  const nominalTotal = totalForSpindown(speed, k1, k2);
  const extraTurns = Math.max(2, Math.round((nominalTotal - effectiveDelta) / (Math.PI * 2)));
  const total = extraTurns * Math.PI * 2 + effectiveDelta;

  return { trajectory: spindownForTotal(total, k1, k2), winnerIndex, winnerPointAngle };
}
