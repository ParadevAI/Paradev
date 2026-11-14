import type { SandboxHostState } from "./reach";

export interface SandboxSocket {
	getConnectionStatus(): { state: string };
	subscribeConnectionStatus(
		listener: (status: { state: string }) => void,
	): () => void;
	reconnect(): void;
}

export const DOWN_GRACE_MS = 2_000;
export const RECHECK_MS = 10_000;
export const MAX_RECHECK_MS = 5 * 60_000;

export function watchForStoppedSandbox({
	bus,
	probe,
	wake,
	graceMs = DOWN_GRACE_MS,
	recheckMs = RECHECK_MS,
}: {
	bus: SandboxSocket;
	probe: () => Promise<SandboxHostState>;
	wake: () => Promise<unknown>;
	graceMs?: number;
	recheckMs?: number;
}): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let checking = false;
	let woken = false;
	let failedWakes = 0;
	let outage = 0;
	let stopped = false;

	const isDown = () => bus.getConnectionStatus().state !== "open";

	const schedule = (ms: number) => {
		if (stopped || woken || checking || timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void check();
		}, ms);
	};

	const check = async () => {
		checking = true;
		const checkedOutage = outage;
		const current = () => !stopped && outage === checkedOutage;
		try {
			if (!isDown() || (await probe()) !== "stopped" || !current()) return;
			await wake();
			if (!current()) return;
			woken = true;
			failedWakes = 0;
			bus.reconnect();
		} catch {
			if (current()) failedWakes++;
		} finally {
			checking = false;
			if (isDown()) {
				schedule(Math.min(recheckMs * 2 ** failedWakes, MAX_RECHECK_MS));
			}
		}
	};

	const onStatus = ({ state }: { state: string }) => {
		if (state === "open") {
			outage++;
			woken = false;
			failedWakes = 0;
			clearTimeout(timer);
			timer = undefined;
			return;
		}
		schedule(graceMs);
	};

	onStatus(bus.getConnectionStatus());
	const unsubscribe = bus.subscribeConnectionStatus(onStatus);
	return () => {
		stopped = true;
		clearTimeout(timer);
		unsubscribe();
	};
}
