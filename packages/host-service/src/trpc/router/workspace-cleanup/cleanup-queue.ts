/** One job at a time. A job past `slotTimeoutMs` gives up its turn but keeps running. */
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
			timer.unref?.();
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
