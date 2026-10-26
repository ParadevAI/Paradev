// One deadline covers response headers, body reads and any compatibility fallback.
export const QUOTA_REQUEST_BUDGET_MS = 8_000;
export const OPTIONAL_QUOTA_BUDGET_MS = 2_000;
export const QUOTA_CAPTURE_BUDGET_MS = 2_000;

export function createQuotaRequestBudget(
	budgetMs = QUOTA_REQUEST_BUDGET_MS,
	now = Date.now,
	timers: {
		set: (
			callback: () => void,
			milliseconds: number,
		) => ReturnType<typeof setTimeout>;
		clear: (timer: ReturnType<typeof setTimeout>) => void;
	} = { set: setTimeout, clear: clearTimeout },
) {
	const deadline = now() + budgetMs;
	return {
		async run<T>(
			operation: (signal: AbortSignal) => Promise<T>,
			limitMs = budgetMs,
		): Promise<T> {
			const remaining = Math.min(limitMs, deadline - now());
			if (remaining <= 0) throw new Error("Usage request timed out.");
			const controller = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				return await Promise.race([
					Promise.resolve().then(() => operation(controller.signal)),
					new Promise<never>((_, reject) => {
						timer = timers.set(() => {
							controller.abort();
							reject(new Error("Usage request timed out."));
						}, remaining);
					}),
				]);
			} finally {
				if (timer !== undefined) timers.clear(timer);
				controller.abort();
			}
		},
	};
}
