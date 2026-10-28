const FIRST_RETRY_MS = 30_000;
const LONGEST_RETRY_MS = 10 * 60_000;

/** How long to wait before the next try after this many failed syncs in a row. */
export function retryDelay(failures: number): number {
	return Math.min(
		FIRST_RETRY_MS * 2 ** Math.max(failures - 1, 0),
		LONGEST_RETRY_MS,
	);
}
