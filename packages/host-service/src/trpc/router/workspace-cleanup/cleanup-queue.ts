/**
 * Runs jobs one at a time, in order. A job that runs past `slotTimeoutMs`
 * gives up its turn so the next job starts; it keeps running and still
 * settles its own promise.
 */
export function createCleanupQueue({
	slotTimeoutMs,
	onSlotTimeout,
}: {
	slotTimeoutMs: number;
	onSlotTimeout?: () => void;
}) {
	let tail: Promise<void> = Promise.resolve();

	return function enqueue<T>(job: () => Promise<T>): Promise<T> {
		const turn = tail;
		let release = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		tail = turn.then(() => released);

		return turn.then(() => {
			const timer = setTimeout(() => {
				onSlotTimeout?.();
				release();
			}, slotTimeoutMs);
			const run = Promise.resolve().then(job);
			void run
				.finally(() => {
					clearTimeout(timer);
					release();
				})
				.catch(() => {});
			return run;
		});
	};
}
