import { NameList } from "./state/nameList";
import { PaletteState } from "./state/paletteState";
import { SoundEngine } from "./audio/soundEngine";
import { Flapper } from "./physics/flapper";
import { spindownForTotal, sampleSpindown, totalForSpindown } from "./physics/spindown";
import { WheelRenderer, DEFAULT_PALETTE } from "./wheel/wheelRenderer";
import { equalSlices } from "./wheel/layouts";
import { spinVariants } from "./wheel/variants";
import { ConfettiSystem } from "./effects/confetti";
import type { RenderElements, SpindownParams, SpinReleaseContext, SpinVariant, SpinVariantPlugin } from "./types";

// pointer sits at the top: canvas-angle convention (0 = +x axis, clockwise positive)
const POINTER_ANGLE = -Math.PI / 2;

// Sanity clamp on the release speed we feed into the physics, so a jittery
// pointer sample can't launch the wheel absurdly fast.
const MAX_RELEASE_OMEGA = 22; // rad/s
// How far back we look, from the moment of release, to measure the drag's
// exit velocity — mimics judging the speed of a real flick by its last
// stretch of motion rather than the whole gesture.
const VELOCITY_WINDOW_MS = 120;

// A game-show-host line for the winner badge, picked at random each time instead of always the
// same static announcement. Each template's {name} is swapped for the actual winner.
const WINNER_ANNOUNCEMENTS = [
  "And the winner is... {name}!",
  "Ladies and gentlemen, {name}!",
  "The wheel has spoken: {name}!",
  "No take-backs — {name} takes it!",
  "{name} steals the show!",
  "Annnd it's... {name}!",
  "Fate has chosen {name}!",
  "{name}, come on down!",
];

function randomWinnerAnnouncement(name: string): string {
  const template = WINNER_ANNOUNCEMENTS[Math.floor(Math.random() * WINNER_ANNOUNCEMENTS.length)] ?? "{name}!";
  return template.replace("{name}", name);
}

// Wraps a rotation delta to (-π, π], so accumulating per-frame pointer-angle
// deltas during a drag never jumps by a full turn when atan2's range seam
// (±π) is crossed.
function normalizeSigned(a: number): number {
  const twoPi = Math.PI * 2;
  return (((a + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI;
}

interface VelocitySample {
  t: number;
  rot: number;
}

interface Elements {
  namesEl: HTMLTextAreaElement;
  rosterEl: HTMLElement;
  countBadge: HTMLElement;
  wheelCanvas: HTMLCanvasElement;
  wheelFrame: HTMLElement;
  winnerBadge: HTMLElement;
  peg: HTMLElement;
  wheelShell: HTMLElement;
  muteBtn: HTMLButtonElement;
  shareBtn: HTMLButtonElement;
  variantSelect: HTMLSelectElement;
  confettiCanvas: HTMLCanvasElement;
  paletteInput: HTMLInputElement;
  resetPaletteBtn: HTMLButtonElement;
}

const NAMES_QUERY_PARAM = "names";
const PALETTE_QUERY_PARAM = "colors";

type Phase = "idle" | "dragging" | "settling";

/** Wires up the DOM, owns the drag/spin lifecycle, and coordinates the renderer/physics/effects modules. */
export class WheelApp {
  private readonly nameList: NameList;
  private readonly paletteState: PaletteState;
  private readonly sound = new SoundEngine();
  private readonly flapper = new Flapper();
  private readonly wheelRenderer: WheelRenderer;
  private readonly confetti: ConfettiSystem;

  private rotation = 0; // radians, current visual rotation (persists across gestures/spins)
  private phase: Phase = "idle";
  private rafId: number | null = null;
  private shareCopyTimeout: number | null = null;

  // drag-gesture state
  private dragPointerId: number | null = null;
  private lastPointerAngle = 0;
  private dragSegBucket = 0;
  private velocitySamples: VelocitySample[] = [];

  constructor(private readonly el: Elements, sharedNames?: string, sharedPalette?: string) {
    this.nameList = new NameList(sharedNames);
    this.paletteState = new PaletteState(sharedPalette);
    this.wheelRenderer = new WheelRenderer(el.wheelCanvas);
    this.confetti = new ConfettiSystem(el.confettiCanvas, this.confettiColors());

    el.namesEl.value = this.nameList.text;
    el.namesEl.addEventListener("input", () => this.onNamesChanged());
    el.paletteInput.value = this.paletteState.text;
    el.paletteInput.addEventListener("input", () => this.onPaletteChanged());
    el.resetPaletteBtn.addEventListener("click", () => this.applyPalette(""));
    el.muteBtn.addEventListener("click", () => {
      this.sound.muted = !this.sound.muted;
      el.muteBtn.classList.toggle("muted", this.sound.muted);
      el.muteBtn.setAttribute("aria-pressed", String(this.sound.muted));
      el.muteBtn.title = this.sound.muted ? "Unmute sound" : "Mute sound";
    });
    el.shareBtn.addEventListener("click", () => this.copyShareLink());

    el.wheelFrame.addEventListener("pointerdown", this.onPointerDown);

    this.saveAndRedraw();
  }

  private confettiColors(): string[] {
    const base = this.paletteState.colors.length > 0 ? this.paletteState.colors : DEFAULT_PALETTE;
    return [...base.slice(0, 4), "#ffffff"];
  }

  private onNamesChanged(): void {
    this.nameList.setText(this.el.namesEl.value);
    this.saveAndRedraw();
  }

  private onPaletteChanged(): void {
    this.paletteState.setText(this.el.paletteInput.value);
    this.wheelRenderer.setPalette(this.paletteState.colors);
    this.confetti.setColors(this.confettiColors());
    this.saveAndRedraw();
  }

  private applyPalette(text: string): void {
    this.el.paletteInput.value = text;
    this.onPaletteChanged();
  }

  private saveAndRedraw(): void {
    this.el.countBadge.textContent = String(this.nameList.count);
    this.wheelRenderer.setPalette(this.paletteState.colors);
    this.wheelRenderer.draw(this.nameList.names, equalSlices(this.nameList.count));
    this.renderRoster();
  }

  /** Rebuilds the enable/disable chip list from the current entries. Full re-render is cheap
   *  enough here — rosters are small, and this only runs on edits/toggles, never mid-spin. */
  private renderRoster(): void {
    const { rosterEl } = this.el;
    rosterEl.innerHTML = "";
    this.nameList.entries.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = entry.disabled ? "roster-item disabled" : "roster-item";

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !entry.disabled;
      checkbox.setAttribute("aria-label", entry.disabled ? `Enable ${entry.name}` : `Disable ${entry.name}`);
      checkbox.addEventListener("change", () => this.toggleEntry(index));

      const nameSpan = document.createElement("span");
      nameSpan.textContent = entry.name;

      label.append(checkbox, nameSpan);
      item.append(label);
      rosterEl.append(item);
    });
  }

  private toggleEntry(entryIndex: number): void {
    this.nameList.toggleDisabled(entryIndex);
    this.el.namesEl.value = this.nameList.text;
    this.saveAndRedraw();
  }

  /** Copies a link that preselects the current roster and colors — names, order, disabled
   *  marks, and any custom palette all round-trip through query params so a shared link
   *  reproduces this exact wheel. */
  private copyShareLink(): void {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set(NAMES_QUERY_PARAM, this.nameList.text);
    if (this.paletteState.text.trim().length > 0) {
      url.searchParams.set(PALETTE_QUERY_PARAM, this.paletteState.text);
    }
    const link = url.toString();

    const onCopied = (): void => {
      const { shareBtn } = this.el;
      shareBtn.classList.add("copied");
      shareBtn.title = "Link copied!";
      if (this.shareCopyTimeout !== null) window.clearTimeout(this.shareCopyTimeout);
      this.shareCopyTimeout = window.setTimeout(() => {
        shareBtn.classList.remove("copied");
        shareBtn.title = "Copy shareable link";
        this.shareCopyTimeout = null;
      }, 1600);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(onCopied).catch(() => {
        this.showBadge("Couldn't copy the link — copy it from the address bar instead.", true);
      });
    } else {
      // Legacy fallback for browsers/contexts without the async clipboard API.
      const scratch = document.createElement("textarea");
      scratch.value = link;
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      try {
        document.execCommand("copy");
        onCopied();
      } catch {
        this.showBadge("Couldn't copy the link — copy it from the address bar instead.", true);
      } finally {
        scratch.remove();
      }
    }
  }

  private showBadge(text: string, gentle = false): void {
    const { winnerBadge } = this.el;
    winnerBadge.textContent = text;
    winnerBadge.classList.toggle("gentle", gentle);
    winnerBadge.classList.remove("show");
    void winnerBadge.offsetWidth;
    winnerBadge.classList.add("show");
  }

  private applyRotation(): void {
    this.el.wheelCanvas.style.transform = `rotate(${this.rotation}rad)`;
  }

  private applyFlapper(): void {
    this.el.peg.style.transform = `translateX(-50%) rotate(${this.flapper.angle}rad)`;
  }

  private pointerAngle(e: PointerEvent): number {
    const rect = this.el.wheelCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  // Continuous (non-normalized, non-modulo) segment index under the fixed pointer.
  // Using rotation - POINTER_ANGLE keeps this aligned with where the pointer actually
  // sits on screen, and leaving it unnormalized means the difference between two
  // samples directly counts how many boundaries were crossed (even several within
  // one frame, or backwards during a drag) instead of just whether the wrapped
  // bucket index happened to change.
  private segmentBucket(rotation: number, segAngle: number): number {
    return Math.floor((rotation - POINTER_ANGLE) / segAngle);
  }

  /** Which slice the pointer is actually resting on, for a uniform 2*PI/n layout.
   *
   *  Note this is NOT segmentBucket's numbering: slices are defined in the wheel's own
   *  (unrotated) frame as [i*segAngle, (i+1)*segAngle), so the wheel-local angle under the
   *  fixed pointer is POINTER_ANGLE - rotation — the opposite sign from segmentBucket, which
   *  only ever gets differenced against itself to count crossings and so doesn't care about
   *  direction. Wrapped into 0..n-1 because this one indexes a real name.
   *
   *  A variant whose frame isn't the uniform grid reports its own answer from renderFrame
   *  instead (see SpinVariantPlugin.renderFrame). */
  private sliceUnderPointer(rotation: number, segAngle: number, n: number): number {
    const local = POINTER_ANGLE - rotation;
    const twoPi = Math.PI * 2;
    const normalized = ((local % twoPi) + twoPi) % twoPi;
    return Math.min(n - 1, Math.floor(normalized / segAngle));
  }

  /** Kicks the flapper once per segment boundary crossed since the last sample, whether by hand or by physics. */
  private feelSegmentCrossing(fromBucket: number, toBucket: number, angularSpeed: number): void {
    const crossings = Math.abs(toBucket - fromBucket);
    for (let i = 0; i < crossings; i++) {
      this.flapper.kick(angularSpeed);
      this.sound.tick(Math.min(1, angularSpeed / 6));
    }
  }

  // Bound as class fields (not prototype methods) so the exact same function
  // reference can be added to `window` on drag-start and removed again on
  // drag-end — addEventListener/removeEventListener only match by reference.
  private onPointerDown = (e: PointerEvent): void => {
    const names = this.nameList.names;
    if (names.length < 2) {
      this.showBadge(names.length === 1 ? "Only one name — that’s already the winner!" : "Add at least two names first.");
      return;
    }

    // Grabbing the wheel mid-spin interrupts whatever inertia was carrying it
    // and hands control straight to your hand, like grabbing a real spinning wheel.
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      // A variant (e.g. Centrifuge) may have left frame-in-flight content on the shared
      // fullscreen overlay; nothing will clear it now that its render loop stopped short.
      this.el.confettiCanvas.getContext("2d")?.clearRect(0, 0, this.el.confettiCanvas.width, this.el.confettiCanvas.height);
    }

    this.sound.ensureContext();
    this.phase = "dragging";
    this.dragPointerId = e.pointerId;
    this.el.wheelFrame.setPointerCapture(e.pointerId);
    this.el.wheelFrame.classList.add("grabbing");
    this.el.winnerBadge.classList.remove("show");

    this.lastPointerAngle = this.pointerAngle(e);
    const segAngle = names.length > 0 ? (Math.PI * 2) / names.length : 0;
    this.dragSegBucket = segAngle > 0 ? this.segmentBucket(this.rotation, segAngle) : 0;
    this.velocitySamples = [{ t: performance.now(), rot: this.rotation }];

    // Track the rest of the gesture on window, not just the wheel element:
    // a fast flick routinely carries the pointer off the wheel (or even
    // outside the viewport) before release, and relying on the wheel's own
    // listeners — even with pointer capture — isn't reliable enough for
    // catching that release everywhere it can happen.
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);

    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.phase !== "dragging" || e.pointerId !== this.dragPointerId) return;

    const angle = this.pointerAngle(e);
    const delta = normalizeSigned(angle - this.lastPointerAngle);
    this.rotation += delta;
    this.lastPointerAngle = angle;
    this.applyRotation();

    const n = this.nameList.count;
    if (n > 0) {
      const segAngle = (Math.PI * 2) / n;
      const bucket = this.segmentBucket(this.rotation, segAngle);
      // impact "speed" while manually dragging is just how fast this move
      // event turned the wheel, converted from radians-per-move to a rough
      // rad/s so it drives the same tick-volume curve as an inertial spin.
      this.feelSegmentCrossing(this.dragSegBucket, bucket, Math.min(6, Math.abs(delta) * 60));
      this.dragSegBucket = bucket;
    }

    const now = performance.now();
    this.velocitySamples.push({ t: now, rot: this.rotation });
    const cutoff = now - VELOCITY_WINDOW_MS;
    while (this.velocitySamples.length > 2 && (this.velocitySamples[0]?.t ?? now) < cutoff) {
      this.velocitySamples.shift();
    }

    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.phase !== "dragging" || e.pointerId !== this.dragPointerId) return;
    if (this.el.wheelFrame.hasPointerCapture(e.pointerId)) {
      this.el.wheelFrame.releasePointerCapture(e.pointerId);
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.el.wheelFrame.classList.remove("grabbing");
    this.dragPointerId = null;
    this.phase = "idle";

    const samples = this.velocitySamples;
    let w0 = 0;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (first && last) {
        const dt = (last.t - first.t) / 1000;
        if (dt > 0.01) w0 = (last.rot - first.rot) / dt;
      }
    }

    this.releaseWithVelocity(w0);
  };

  private get renderElements(): RenderElements {
    return {
      ...this.wheelRenderer.geometry,
      wheelCanvas: this.el.wheelCanvas,
      wheelFrame: this.el.wheelFrame,
      confettiCanvas: this.el.confettiCanvas,
    };
  }

  /** Given a signed release angular velocity (rad/s), builds the default quadratic-drag
   *  trajectory for that release and hands it to the selected variant plugin, which decides
   *  the actual trajectory to animate and which name (if any) it lands on. */
  private releaseWithVelocity(w0: number): void {
    const names = this.nameList.names;
    const direction: 1 | -1 = w0 >= 0 ? 1 : -1;
    const speed = Math.min(Math.abs(w0), MAX_RELEASE_OMEGA);

    // Drag+friction params for this spin, randomized within a tuned range so
    // every release feels a little different (like a real wheel varying with
    // bearing wear, humidity, how hard it was pushed) while always keeping
    // the shape: a quick bleed-off from launch speed, then a long, slow,
    // readable crawl at the end.
    const k1 = 0.08 + Math.random() * 0.03; // quadratic drag
    const k2 = 0.28 + Math.random() * 0.12; // constant rolling friction
    const baseTrajectory = spindownForTotal(totalForSpindown(speed, k1, k2), k1, k2);

    const plugin = spinVariants[this.el.variantSelect.value as SpinVariant] ?? spinVariants.classic;
    const releaseCtx: SpinReleaseContext = {
      names,
      releaseOmega: direction * speed,
      direction,
      baseTrajectory,
      currentRotation: this.rotation,
      pointerAngle: POINTER_ANGLE,
    };
    const prepared = plugin.prepareSpin(releaseCtx);

    const segAngle = names.length > 0 ? (Math.PI * 2) / names.length : 0;
    this.animateSpindown(prepared.trajectory, direction, prepared.winnerIndex, plugin, segAngle);
  }

  private animateSpindown(traj: SpindownParams, direction: 1 | -1, winnerIndex: number | null, plugin: SpinVariantPlugin, segAngle: number): void {
    const startRotation = this.rotation;
    const tStop = traj.tStop;
    const names = this.nameList.names;
    const els = this.renderElements;

    let lastSegBucket = segAngle > 0 ? this.segmentBucket(startRotation, segAngle) : 0;
    // Whether lastSegBucket came from the uniform grid or from the variant's own reported
    // index — these are different numbering schemes (continuous vs wrapped 0..n-1), so a frame
    // that switches between them must re-baseline instead of diffing across the switch.
    let lastBucketWasUniform = true;
    // The most recent slice index the variant reported for its own (non-uniform) layout, if any.
    // Read once the wheel is at rest to decide the actual winner — see the finish branch below.
    let lastVariantBucket: number | void;
    let lastFrameTime = performance.now();
    const startTime = lastFrameTime;
    let wheelDone = false;
    this.phase = "settling";

    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      const t = (now - startTime) / 1000;

      let angularSpeed: number;
      if (t < tStop) {
        const sample = sampleSpindown(traj, t);
        this.rotation = startRotation + direction * sample.theta;
        angularSpeed = sample.omega;
      } else {
        this.rotation = startRotation + direction * traj.total;
        angularSpeed = 0;
        wheelDone = true;
      }
      this.applyRotation();

      const variantBucket = plugin.renderFrame(els, { t, theta: this.rotation - startRotation, omega: angularSpeed, done: wheelDone, names, winnerIndex });
      lastVariantBucket = variantBucket;

      if (segAngle > 0) {
        const isUniform = variantBucket === undefined;
        const bucket = isUniform ? this.segmentBucket(this.rotation, segAngle) : variantBucket;
        if (isUniform === lastBucketWasUniform) {
          this.feelSegmentCrossing(lastSegBucket, bucket, angularSpeed);
        }
        lastSegBucket = bucket;
        lastBucketWasUniform = isUniform;
      }

      this.flapper.step(dt);
      this.applyFlapper();

      if (!wheelDone || !this.flapper.settled) {
        this.rafId = requestAnimationFrame(frame);
      } else {
        this.rafId = null;
        this.phase = "idle";
        if (winnerIndex !== null) {
          // The winner is whatever the pointer is physically resting on now that everything has
          // stopped — not the index prepareSpin aimed for. Those agree for a plain wheel, but a
          // variant is free to reshape the slices under the pointer as it settles (Growing Field
          // widens one slice and pins the pointer inside it), and when they disagree what's on
          // screen has to win: announcing the planned index would name someone the wheel visibly
          // isn't pointing at. Variants that aren't on the uniform grid report the slice under
          // the pointer themselves; everyone else gets read off the final rotation.
          const landedIndex = typeof lastVariantBucket === "number"
            ? lastVariantBucket
            : this.sliceUnderPointer(this.rotation, segAngle, names.length);
          this.finishSpin(landedIndex, plugin);
        } else {
          this.showBadge("Not quite enough oomph — give it a firmer spin!", true);
        }
      }
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private async finishSpin(winnerIndex: number, plugin: SpinVariantPlugin): Promise<void> {
    const winnerName = this.nameList.names[winnerIndex] ?? "";

    await plugin.onFinish?.({ names: this.nameList.names, winnerIndex });

    this.el.wheelShell.classList.remove("shake");
    void this.el.wheelShell.offsetWidth;
    this.el.wheelShell.classList.add("shake");

    this.showBadge(randomWinnerAnnouncement(winnerName));

    this.sound.playFanfare();

    const rect = this.el.wheelCanvas.getBoundingClientRect();
    this.confetti.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}

/** Reads shared roster/palette params, if the link that loaded this page carried them,
 *  then strips the params so a later reload doesn't keep clobbering the user's own edits
 *  with the shared values every time. */
function consumeSharedStateFromUrl(): { names?: string; palette?: string } {
  const params = new URLSearchParams(window.location.search);
  const names = params.get(NAMES_QUERY_PARAM);
  const palette = params.get(PALETTE_QUERY_PARAM);
  if (names === null && palette === null) return {};

  params.delete(NAMES_QUERY_PARAM);
  params.delete(PALETTE_QUERY_PARAM);
  const query = params.toString();
  const cleanUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState(null, "", cleanUrl);

  return { names: names ?? undefined, palette: palette ?? undefined };
}

export function mountWheelApp(): void {
  const shared = consumeSharedStateFromUrl();

  const el: Elements = {
    namesEl: document.getElementById("names") as HTMLTextAreaElement,
    rosterEl: document.getElementById("roster") as HTMLElement,
    countBadge: document.getElementById("countBadge") as HTMLElement,
    wheelCanvas: document.getElementById("wheel") as HTMLCanvasElement,
    wheelFrame: document.getElementById("wheelFrame") as HTMLElement,
    winnerBadge: document.getElementById("winnerBadge") as HTMLElement,
    peg: document.getElementById("peg") as HTMLElement,
    wheelShell: document.getElementById("wheelShell") as HTMLElement,
    muteBtn: document.getElementById("muteBtn") as HTMLButtonElement,
    shareBtn: document.getElementById("shareBtn") as HTMLButtonElement,
    variantSelect: document.getElementById("variantSelect") as HTMLSelectElement,
    confettiCanvas: document.getElementById("confetti") as HTMLCanvasElement,
    paletteInput: document.getElementById("paletteInput") as HTMLInputElement,
    resetPaletteBtn: document.getElementById("resetPaletteBtn") as HTMLButtonElement,
  };

  new WheelApp(el, shared.names, shared.palette);
}
