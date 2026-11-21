export const DISCOVERY_DEADLINE_MS = 20_000;

/** The agent has no model listing on this surface. */
export class NoModelListing extends Error {}

export async function abortable<T>(
	work: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	let abort: () => void = () => {};
	const cancelled = new Promise<never>((_, reject) => {
		abort = () => reject(new Error("Model discovery timed out"));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
	try {
		return await Promise.race([work, cancelled]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}
