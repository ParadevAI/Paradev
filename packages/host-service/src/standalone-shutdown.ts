interface StandaloneShutdownOptions {
	stopServing: () => Promise<void>;
	dispose: () => Promise<void>;
	stopDaemon?: () => Promise<void>;
	exit?: (code: number) => void;
	hardExit?: () => void;
	scheduleDeadline?: (callback: () => void, delayMs: number) => () => void;
	log?: (message: string) => void;
}

// The CLI escalates to SIGKILL after 10 seconds.
const SHUTDOWN_TIMEOUT_MS = 8_000;

export function createStandaloneShutdown({
	stopServing,
	dispose,
	stopDaemon,
	exit = (code) => process.exit(code),
	hardExit = () => process.kill(process.pid, "SIGKILL"),
	scheduleDeadline = (callback, delayMs) => {
		const timer = setTimeout(callback, delayMs);
		return () => clearTimeout(timer);
	},
	log = (message) => console.log(message),
}: StandaloneShutdownOptions): (signal: NodeJS.Signals) => Promise<void> {
	let shuttingDown = false;
	let finished = false;
	let cancelDeadline = () => {};
	const forceExit = () => {
		if (finished) return;
		finished = true;
		cancelDeadline();
		hardExit();
	};

	return async (signal) => {
		if (finished) return;
		if (shuttingDown) {
			log(`[host-service] repeated ${signal} during shutdown; hard-exiting`);
			forceExit();
			return;
		}
		shuttingDown = true;
		log(`[host-service] shutdown (${signal})`);
		cancelDeadline = scheduleDeadline(() => {
			if (finished) return;
			log(
				`[host-service] shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms; hard-exiting`,
			);
			forceExit();
		}, SHUTDOWN_TIMEOUT_MS);

		const steps = [
			["stop serving", stopServing],
			["stop dev daemon", stopDaemon],
			["dispose", dispose],
		] as const;
		for (const [name, cleanup] of steps) {
			if (finished) return;
			try {
				await cleanup?.();
			} catch (error) {
				log(`[host-service] shutdown ${name} failed: ${String(error)}`);
			}
		}
		if (finished) return;
		finished = true;
		cancelDeadline();
		log("[host-service] shutdown complete");
		exit(0);
	};
}
