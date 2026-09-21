import type { SpindownParams, SpindownSample } from "../types";

// A real wheel doesn't lose speed at a constant rate the whole way down:
// at high speed, air drag (roughly proportional to speed squared) does
// most of the braking, which bleeds off the initial burst quickly; at low
// speed that term is tiny and a small constant rolling-friction term takes
// over, which is what gives a real wheel (or a coin, or a roulette wheel)
// its long, slow, readable crawl at the very end instead of coasting to a
// stop at a uniform rate throughout.
//   dω/dt = -(k1 * ω^2 + k2)
// This separable ODE has an exact closed-form solution (derived via
// ∫ ω/(k1ω²+k2) dω), so the whole trajectory — and the launch speed
// needed to travel an exact target distance — can be computed directly,
// with no numeric integration, no lookup table, and no search bound that
// could ever fail to reach the target:
//   ωc = sqrt(k1*k2)
//   θ0 = atan(ω0 * sqrt(k1/k2))
//   t_stop = θ0 / ωc
//   ω(t) = sqrt(k2/k1) * tan(θ0 − t·ωc)
//   θ(t) = (1/k1) * ln( cos(θ0 − t·ωc) / cos(θ0) )
//   total = θ(t_stop) = −(1/k1) * ln(cos(θ0))
// Inverting the last line gives the launch speed for any desired total
// distance: θ0 = acos(e^(−k1·total)), ω0 = sqrt(k2/k1) * tan(θ0).

export function spindownForTotal(total: number, k1: number, k2: number): SpindownParams {
  const theta0 = Math.acos(Math.exp(-k1 * total));
  const wc = Math.sqrt(k1 * k2);
  return { k1, k2, wc, theta0, tStop: theta0 / wc, total };
}

export function sampleSpindown(p: SpindownParams, t: number): SpindownSample {
  if (t >= p.tStop) return { theta: p.total, omega: 0 };
  const u = p.theta0 - t * p.wc;
  return {
    theta: (1 / p.k1) * Math.log(Math.cos(u) / Math.cos(p.theta0)),
    omega: Math.sqrt(p.k2 / p.k1) * Math.tan(u),
  };
}

/** How far a given launch speed would naturally travel under this drag model. */
export function totalForSpindown(w0: number, k1: number, k2: number): number {
  const theta0 = Math.atan(w0 * Math.sqrt(k1 / k2));
  return -(1 / k1) * Math.log(Math.cos(theta0));
}

/** Exact time at which ω(t) drops to a given value, solved the same closed form. */
export function spindownTimeAtOmega(p: SpindownParams, omega: number): number {
  const u = Math.atan(omega * Math.sqrt(p.k1 / p.k2));
  return (p.theta0 - u) / p.wc;
}
