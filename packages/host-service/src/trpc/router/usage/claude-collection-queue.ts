export function createClaudeCollectionQueue({
	now = Date.now,
	sleep = (ms: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, ms)),
	staggerMs = 150,
	capacity = 1024,
}: {
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	staggerMs?: number;
	capacity?: number;
} = {}) {
	type Job = {
		key: string;
		priority: boolean;
		run(signal: AbortSignal): Promise<unknown>;
		resolve(value: unknown): void;
		reject(error: unknown): void;
		promise: Promise<unknown>;
		controller: AbortController;
	};
	const jobs = new Map<string, Job>();
	const listeners = new Set<() => void>();
	let running = false;
	let disposed = false;
	let lastStart = Number.NEGATIVE_INFINITY;
	let active: Job | undefined;
	let draining: Promise<void> | undefined;
	async function drain() {
		if (running || disposed) return;
		running = true;
		try {
			while (jobs.size && !disposed) {
				const job =
					[...jobs.values()].find((entry) => entry.priority) ??
					jobs.values().next().value;
				if (!job) break;
				const wait = staggerMs - (now() - lastStart);
				if (wait > 0) await sleep(wait);
				if (disposed) break;
				lastStart = now();
				active = job;
				try {
					job.resolve(await job.run(job.controller.signal));
				} catch (error) {
					job.reject(error);
				} finally {
					active = undefined;
					jobs.delete(job.key);
					for (const listener of listeners) {
						try {
							listener();
						} catch {}
					}
				}
			}
		} finally {
			running = false;
		}
	}
	return {
		enqueue<T>(
			key: string,
			run: (signal: AbortSignal) => Promise<T>,
			priority = false,
		): Promise<T> {
			if (disposed)
				return Promise.reject(new Error("Usage collector is closed."));
			const existing = jobs.get(key);
			if (existing) {
				existing.priority ||= priority;
				return existing.promise as Promise<T>;
			}
			if (jobs.size >= capacity)
				return Promise.reject(new Error("Usage collector is busy."));
			let resolve!: (value: unknown) => void;
			let reject!: (value: unknown) => void;
			const promise = new Promise<unknown>((yes, no) => {
				resolve = yes;
				reject = no;
			});
			jobs.set(key, {
				key,
				priority,
				run,
				resolve,
				reject,
				promise,
				controller: new AbortController(),
			});
			if (!running) draining = drain();
			return promise as Promise<T>;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		async dispose() {
			disposed = true;
			active?.controller.abort();
			for (const [key, job] of jobs) {
				if (job === active) continue;
				job.controller.abort();
				job.reject(new Error("Usage collection cancelled."));
				jobs.delete(key);
			}
			listeners.clear();
			await draining?.catch(() => {});
		},
	};
}

export function createRestartableClaudeCollectionQueue(
	options: Parameters<typeof createClaudeCollectionQueue>[0] = {},
) {
	let current: ReturnType<typeof createClaudeCollectionQueue> | undefined;
	let closing: Promise<void> | undefined;
	const listeners = new Set<() => void>();
	function queue() {
		if (closing) throw new Error("Usage collector is closing.");
		if (!current) {
			current = createClaudeCollectionQueue(options);
			current.subscribe(() => {
				for (const listener of listeners) {
					try {
						listener();
					} catch {}
				}
			});
		}
		return current;
	}
	return {
		enqueue<T>(
			key: string,
			run: (signal: AbortSignal) => Promise<T>,
			priority = false,
		): Promise<T> {
			try {
				return queue().enqueue(key, run, priority);
			} catch (error) {
				return Promise.reject(error);
			}
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose(): Promise<void> {
			if (closing) return closing;
			const previous = current;
			if (!previous) return Promise.resolve();
			const operation = previous.dispose().finally(() => {
				if (current === previous) current = undefined;
				if (closing === operation) closing = undefined;
			});
			closing = operation;
			return operation;
		},
	};
}
