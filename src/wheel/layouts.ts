/** A slice's angular span, in the wheel's own (unrotated) coordinate frame. */
export interface Slice {
  start: number;
  end: number;
}

/** Every slice at its plain, equal width — the layout for a wheel with no spin variant active. */
export function equalSlices(n: number): Slice[] {
  if (n <= 0) return [];
  const segAngle = (Math.PI * 2) / n;
  return Array.from({ length: n }, (_, i) => ({ start: i * segAngle, end: (i + 1) * segAngle }));
}

/** The plain, evenly-distributed layout every spin variant starts from and reverts to whenever
 *  its own effect isn't active — an alias for equalSlices so variant code reads as "the neutral
 *  layout" rather than reaching for equalSlices as if it were just one option among several. */
export const baseSlices = equalSlices;
