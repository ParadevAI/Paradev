/** One job at a time. A job past its slot timeout has its signal aborted; the next job starts once it settles. */
export function createCleanupQueue({
	slotTimeoutMs,
	onSlotTimeout,
}: {
	slotTimeoutMs: () => number;
	onSlotTimeout?: () => void;
}) {
	let tail: Promise<void> = Promise.resolve();

	return function enqueue<T>(
		job: (signal: AbortSignal) => Promise<T>,
	): Promise<T> {
		const run = tail.then(() => {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				onSlotTimeout?.();
				controller.abort();
			}, slotTimeoutMs());
			timer.unref?.();
			return Promise.resolve()
				.then(() => job(controller.signal))
				.finally(() => clearTimeout(timer));
		});
		tail = run.then(
			() => {},
			() => {},
		);
		return run;
	};
}
