import type { ContentScrollsUnderHeader } from "./contentScrollsUnderHeader.types";

// contentInsetAdjustmentBehavior is iOS-only: under a transparent header the
// first rows would sit behind the bar and lose their taps.
export const contentScrollsUnderHeader: ContentScrollsUnderHeader = false;
