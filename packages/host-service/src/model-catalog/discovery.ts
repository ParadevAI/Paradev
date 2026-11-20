export const DISCOVERY_DEADLINE_MS = 20_000;

export type DiscoveryFailure = "unsupported" | "timeout" | "busy" | "failed";

export class DiscoveryError extends Error {
	constructor(readonly reason: DiscoveryFailure) {
		super(reason);
	}
}

export function discoveryFailure(error: unknown): DiscoveryFailure {
	return error instanceof DiscoveryError ? error.reason : "failed";
}

export async function abortable<T>(
	work: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	if (signal.aborted) {
		void work.catch(() => {});
		throw new DiscoveryError("timeout");
	}
	let abort: () => void = () => {};
	const cancelled = new Promise<never>((_, reject) => {
		abort = () => reject(new DiscoveryError("timeout"));
		signal.addEventListener("abort", abort, { once: true });
	});
	try {
		return await Promise.race([work, cancelled]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}

export class DiscoveryScheduler {
	private running = 0;
	private waiting: Array<() => void> = [];
	constructor(
		private readonly concurrency = 2,
		private readonly capacity = 32,
	) {}
	private release() {
		const next = this.waiting.shift();
		if (next) next();
		else this.running--;
	}
	async run<T>(
		work: (signal: AbortSignal) => Promise<T>,
		signal = AbortSignal.timeout(DISCOVERY_DEADLINE_MS),
	): Promise<T> {
		if (this.waiting.length >= this.capacity) throw new DiscoveryError("busy");
		if (signal.aborted) throw new DiscoveryError("timeout");
		if (this.running >= this.concurrency) {
			let resume: () => void = () => {};
			const ready = new Promise<void>((resolve) => {
				resume = resolve;
				this.waiting.push(resume);
			});
			try {
				await abortable(ready, signal);
			} catch (error) {
				const index = this.waiting.indexOf(resume);
				if (index >= 0) this.waiting.splice(index, 1);
				else this.release();
				throw error;
			}
		} else this.running++;
		try {
			if (signal.aborted) throw new DiscoveryError("timeout");
			return await work(signal);
		} finally {
			this.release();
		}
	}
}
