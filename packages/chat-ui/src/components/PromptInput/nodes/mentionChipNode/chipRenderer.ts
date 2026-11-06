import { createContext, type ReactNode } from "react";
import type { ComposerChip } from "../../types";

export const ChipRendererContext = createContext<
	((chip: ComposerChip) => ReactNode) | undefined
>(undefined);
