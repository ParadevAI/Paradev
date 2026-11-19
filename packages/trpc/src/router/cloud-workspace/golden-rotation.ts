/** Rule 2: an environment keeps its active golden and its newest others, this many in all. */
export const KEPT_GOLDENS = 3;

/**
 * Goldens past the active one and the `KEPT_GOLDENS - 1` newest others.
 * Takes undeleted goldens, newest first; never returns the active one.
 * The same as `goldensToDelete` in #10000's environment-build policy.
 */
export function goldensToDelete<T extends { goldenRef: string }>(
	goldens: readonly T[],
	activeRef: string,
): T[] {
	return goldens
		.filter((golden) => golden.goldenRef !== activeRef)
		.slice(KEPT_GOLDENS - 1);
}
