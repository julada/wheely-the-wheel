interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  life: number;
  maxLife: number;
}

/** Simple particle-burst confetti effect rendered onto a fullscreen overlay canvas. */
export class ConfettiSystem {
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement, private colors: string[]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setColors(colors: string[]): void {
    this.colors = colors;
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(originX: number, originY: number): void {
    for (let i = 0; i < 140; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      this.particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 4 + Math.random() * 5,
        color: this.colors[Math.floor(Math.random() * this.colors.length)] ?? "#ffffff",
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 90 + Math.random() * 40,
      });
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.animate());
    }
  }

  private animate(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of this.particles) {
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.animate());
    } else {
      this.running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
