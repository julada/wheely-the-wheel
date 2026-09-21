/** Wraps the WebAudio context: soft ticks per peg strike plus a landing fanfare, both mutable. */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Must be called from a user-gesture handler (e.g. the spin click) before any sound plays. */
  ensureContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** volume in [0,1], typically driven by the wheel's angular speed at peg impact. */
  tick(volume: number): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1200 + volume * 400;
    gain.gain.setValueAtTime(0.02 + volume * 0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  playFanfare(): void {
    if (this.muted) return;
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
  }
}
