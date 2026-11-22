import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Widest a column of prose, rows or cards gets before it centers. */
export const READABLE_WIDTH = 720;

/**
 * Horizontal padding that centers a scroll view's content in a
 * `READABLE_WIDTH` column once the safe area is wider than that — an iPad, the
 * open iPhone Duo, or a wide Split View / Stage Manager window — and is just
 * `base` on a phone. A scroll view with `contentInsetAdjustmentBehavior` set
 * adds the side safe area on top. Code, diffs and the terminal stay full
 * width; don't use it there.
 */
export function useReadableInset(base = 0): number {
	const { width } = useWindowDimensions();
	const { left, right } = useSafeAreaInsets();
	return Math.max(base, (width - left - right - READABLE_WIDTH) / 2);
}
