import { useWindowDimensions } from "react-native";

/** iOS's first accessibility text size (AX1) scales body text by about 1.65. */
export const ACCESSIBILITY_FONT_SCALE = 1.6;

/**
 * Whether the user picked one of the accessibility text sizes. At these sizes
 * a one-line label shows only a few characters, so names should wrap instead.
 */
export function useAccessibilityTextSize(): boolean {
	return useWindowDimensions().fontScale >= ACCESSIBILITY_FONT_SCALE;
}
