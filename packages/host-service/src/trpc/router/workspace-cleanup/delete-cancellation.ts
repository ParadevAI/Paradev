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
