const FIRST_RETRY_MS = 30_000;
const LONGEST_RETRY_MS = 10 * 60_000;

export function retryDelay(failures: number): number {
	return Math.min(
		FIRST_RETRY_MS * 2 ** Math.max(failures - 1, 0),
		LONGEST_RETRY_MS,
	);
}
