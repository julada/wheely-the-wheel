import { baseSlices } from "../../layouts";
import { paintWheel } from "../../wheelRenderer";
import type { PreparedSpin, SpinVariantPlugin } from "../../../types";
import { computeLandingSpin } from "../landing";

export const classicVariant: SpinVariantPlugin = {
  id: "classic",
  label: "Classic",

  prepareSpin(ctx): PreparedSpin {
    const landing = computeLandingSpin(ctx);
    if (!landing) return { trajectory: ctx.baseTrajectory, winnerIndex: null };
    return { trajectory: landing.trajectory, winnerIndex: landing.winnerIndex };
  },

  renderFrame(els, state) {
    paintWheel(els, state.names, baseSlices(state.names.length), state.winnerIndex ?? 0, 0);
  },
};
