import type { RefObject } from "react";

/** Focuses a sheet's input; returns the input's `autoFocus`. */
export type UseSheetAutoFocus = (
	input: RefObject<{ focus: () => void } | null>,
) => boolean;
