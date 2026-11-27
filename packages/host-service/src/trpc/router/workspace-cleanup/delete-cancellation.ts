export class DeleteCancelledError extends Error {
	constructor() {
		super("Delete cancelled: it ran past its cleanup turn");
		this.name = "DeleteCancelledError";
	}
}

/** Rejects with DeleteCancelledError once `signal` aborts, even if `work` never settles. */
export function untilCancelled<T>(
	signal: AbortSignal,
	work: Promise<T>,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const cancel = () => reject(new DeleteCancelledError());
		if (signal.aborted) {
			cancel();
			void work.catch(() => {});
			return;
		}
		signal.addEventListener("abort", cancel, { once: true });
		work.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", cancel);
		});
	});
}

/** Waits at most `ms` for `work`. Its value or error passes through when it settles in time. */
export async function settleWithin<T>(
	work: Promise<T>,
	ms: number,
): Promise<{ settled: true; value: T } | { settled: false }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<{ settled: false }>((resolve) => {
		timer = setTimeout(() => resolve({ settled: false }), ms);
		timer.unref?.();
	});
	try {
		return await Promise.race([
			work.then((value) => ({ settled: true as const, value })),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}
