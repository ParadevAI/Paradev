import { useWideLayout } from "@/hooks/useWideLayout";

/** Widest a column of prose, rows or cards gets before it centers. */
export const READABLE_WIDTH = 720;

/**
 * Horizontal padding that centers a scroll view's content in a
 * `READABLE_WIDTH` column once the safe area is wider than that — an iPad, the
 * unfolded iPhone Duo, or a wide Split View / Stage Manager window — and is
 * just `base` on a phone. Code, diffs and the terminal stay full width; don't
 * use it there.
 */
export function useReadableInset(base = 0): number {
	const { contentWidth } = useWideLayout();
	return Math.max(base, (contentWidth - READABLE_WIDTH) / 2);
}
