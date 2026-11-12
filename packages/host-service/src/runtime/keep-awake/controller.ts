export interface KeepAwakeLease {
	isRunning(): boolean;
	stop(): void;
}

export interface KeepAwakeController {
	readonly supported: boolean;
	setEnabled(enabled: boolean): void;
	stop(): void;
}

interface KeepAwakeOptions {
	supported: boolean;
	enabled: boolean;
	hasWork(): boolean;
	confirmWork(signal: AbortSignal): Promise<boolean>;
	readPower(signal: AbortSignal): Promise<boolean>;
	startLease(): KeepAwakeLease;
	subscribe(listener: () => void): () => void;
	now?: () => number;
	schedule?: (callback: () => void, delayMs: number) => () => void;
	onError?: (error: unknown) => void;
	pollMs?: number;
	renewMs?: number;
}

export function createKeepAwakeController(
	options: KeepAwakeOptions,
): KeepAwakeController {
	const {
		supported,
		now = Date.now,
		pollMs = 30_000,
		renewMs = 60_000,
		onError = (error) => console.warn("[keep-awake] check failed", error),
		schedule = (callback, delayMs) => {
			const timer = setTimeout(callback, delayMs);
			timer.unref();
			return () => clearTimeout(timer);
		},
	} = options;
	let enabled = options.enabled;
	let stopped = false;
	let generation = 0;
	let checking = false;
	let lease: KeepAwakeLease | undefined;
	let startedAt = 0;
	let cancelTimer: (() => void) | undefined;
	let abort: AbortController | undefined;

	function hasWork(): boolean {
		if (stopped || !supported || !enabled) return false;
		try {
			return options.hasWork();
		} catch (error) {
			onError(error);
			return false;
		}
	}

	function releaseLease(): void {
		const previous = lease;
		lease = undefined;
		previous?.stop();
	}

	function suspend(): void {
		generation += 1;
		abort?.abort();
		cancelTimer?.();
		cancelTimer = undefined;
		releaseLease();
	}

	async function check(): Promise<void> {
		const current = generation;
		const probe = new AbortController();
		abort = probe;
		checking = true;
		try {
			const powered = await options.readPower(probe.signal);
			if (current !== generation || !hasWork()) return;
			const working = powered && (await options.confirmWork(probe.signal));
			if (current !== generation || !hasWork()) return;
			if (!working) {
				releaseLease();
			} else if (!lease?.isRunning() || now() - startedAt >= renewMs) {
				const next = options.startLease();
				const previous = lease;
				lease = next;
				startedAt = now();
				previous?.stop();
			}
		} catch (error) {
			if (current === generation && !probe.signal.aborted) {
				releaseLease();
				onError(error);
			}
		} finally {
			checking = false;
			if (abort === probe) abort = undefined;
			if (!hasWork()) {
				suspend();
			} else {
				if (current !== generation) {
					reconcile();
				} else {
					cancelTimer = schedule(() => {
						cancelTimer = undefined;
						reconcile();
					}, pollMs);
				}
			}
		}
	}

	function reconcile(): void {
		if (!hasWork()) {
			suspend();
			return;
		}
		if (!checking && !cancelTimer) void check();
	}

	const unsubscribe = supported ? options.subscribe(reconcile) : () => {};
	if (supported) reconcile();

	return {
		supported,
		setEnabled(value) {
			if (stopped) return;
			enabled = value;
			reconcile();
		},
		stop() {
			if (stopped) return;
			stopped = true;
			unsubscribe();
			suspend();
		},
	};
}
