/** Hands `flush` to the next frame (or a timer); returns a cancel. */
export type Schedule = (flush: () => void) => () => void;

/**
 * Collects actions and delivers them in order, as batches. Deferred actions
 * (a box's streamed tokens) wait for the next scheduled flush, so a stream
 * renders at most once per frame. Any other action flushes at once, behind
 * whatever was queued before it.
 */
export function createActionBatcher<A>(opts: {
	deliver: (actions: A[]) => void;
	deferred: (action: A) => boolean;
	schedule: Schedule;
}) {
	let queue: A[] = [];
	let cancel: (() => void) | null = null;

	function flush() {
		const scheduled = cancel;
		cancel = null;
		scheduled?.();
		if (!queue.length) return;
		const batch = queue;
		queue = [];
		opts.deliver(batch);
	}

	return {
		push(action: A) {
			queue.push(action);
			if (!opts.deferred(action)) flush();
			else if (!cancel) cancel = opts.schedule(flush);
		},
		stop() {
			cancel?.();
			cancel = null;
			queue = [];
		},
	};
}

/** The next animation frame, or a quarter second when the window gets no frames. */
export const nextFrame: Schedule = (flush) => {
	const frame = requestAnimationFrame(flush);
	const timer = setTimeout(flush, 250);
	return () => {
		cancelAnimationFrame(frame);
		clearTimeout(timer);
	};
};
