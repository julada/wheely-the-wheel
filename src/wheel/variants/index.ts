import { classicVariant } from "./classic";
import { growVariant } from "./grow";
import { centrifugeVariant } from "./centrifuge";
import type { SpinVariant, SpinVariantPlugin } from "../../types";

export const spinVariants: Record<SpinVariant, SpinVariantPlugin> = {
  classic: classicVariant,
  grow: growVariant,
  centrifuge: centrifugeVariant,
};
