import { caught } from "./runtime/box-log-filter";

interface StandaloneShutdownOptions {
	stopServing: () => Promise<void>;
	dispose: () => Promise<void>;
	stopDaemon?: () => Promise<void>;
	exit?: (code: number) => void;
	hardExit?: () => void;
	scheduleDeadline?: (callback: () => void, delayMs: number) => () => void;
	log?: (message: string, ...details: unknown[]) => void;
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
	log = (message, ...details) => console.log(message, ...details),
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
			log(
				"[host-service] forcing exit after repeated shutdown signal:",
				signal,
			);
			forceExit();
			return;
		}
		shuttingDown = true;
		log("[host-service] shutdown signal:", signal);
		cancelDeadline = scheduleDeadline(() => {
			if (finished) return;
			log(
				"[host-service] forcing exit after shutdown deadline (ms):",
				SHUTDOWN_TIMEOUT_MS,
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
				log("[host-service] shutdown step failed:", name, caught(error));
			}
		}
		if (finished) return;
		finished = true;
		cancelDeadline();
		log("[host-service] shutdown complete");
		exit(0);
	};
}
