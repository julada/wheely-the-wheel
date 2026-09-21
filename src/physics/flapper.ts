// The pointer is a small flexible flapper riding over pegs between segments.
// Each peg it rides over kicks it back; it is not free-standing, it is a
// damped spring (like a real strip of spring steel or plastic) that always
// returns to its rest angle. This is where the "wobble near the stop" the
// wheel itself does NOT do actually comes from physically.
const FLAPPER_STIFFNESS = 1400; // spring constant (rad/s^2 per rad)
const FLAPPER_DAMPING = 24; // damping coefficient (1/s)

/** Damped-spring simulation for the peg-riding pointer, driven frame-by-frame by peg strikes. */
export class Flapper {
  angle = 0;
  private velocity = 0;

  /** impactSpeed: angular speed of the wheel (rad/s) at the moment of contact. */
  kick(impactSpeed: number): void {
    this.velocity += -3.2 * Math.min(1, impactSpeed / 6);
  }

  step(dt: number): void {
    const accel = -FLAPPER_STIFFNESS * this.angle - FLAPPER_DAMPING * this.velocity;
    this.velocity += accel * dt;
    this.angle += this.velocity * dt;
  }

  get settled(): boolean {
    return Math.abs(this.angle) < 0.0008 && Math.abs(this.velocity) < 0.02;
  }
}
