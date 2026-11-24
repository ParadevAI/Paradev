export function createConcurrencyLimit(limit: number) {
	let active = 0;
	const waiting: Array<() => void> = [];

	return async function run<T>(task: () => Promise<T>): Promise<T> {
		if (active >= limit) {
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
