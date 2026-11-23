/** Runs at most `max` tasks at once; the rest wait in arrival order. */
export function createConcurrencyLimit(max: number) {
	let active = 0;
	const waiting: (() => void)[] = [];

	return async function limit<T>(task: () => Promise<T>): Promise<T> {
		if (active >= max) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		} else {
			active += 1;
		}
		try {
			return await task();
		} finally {
			const next = waiting.shift();
			if (next) next();
			else active -= 1;
		}
	};
}
