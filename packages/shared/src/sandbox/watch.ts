import type { SandboxHostState } from "./reach";

/** The part of a reconnecting socket this needs; the desktop event bus is one. */
export interface SandboxSocket {
	getConnectionStatus(): { state: string };
	subscribeConnectionStatus(
		listener: (status: { state: string }) => void,
	): () => void;
	reconnect(): void;
}

/** Under this, a dropped socket is an ordinary redial, not a stopped box. */
export const DOWN_GRACE_MS = 2_000;
/**
 * A socket that keeps failing stays in one state and reports nothing more,
 * so while it is down the box is probed again at this cadence.
 */
export const RECHECK_MS = 10_000;

/**
 * Wakes a cloud workspace's box when its socket is down because the box
 * stopped. A socket only redials, and a stopped box answers every dial with
 * `410` until something asks the API to resume it. After a wake that
 * succeeded, the next one waits until the socket has opened again.
 */
export function watchForStoppedSandbox({
	bus,
	probe,
	wake,
	graceMs = DOWN_GRACE_MS,
	recheckMs = RECHECK_MS,
}: {
	bus: SandboxSocket;
	probe: () => Promise<SandboxHostState>;
	/** Rejects when the wake failed, so a later check may try again. */
	wake: () => Promise<unknown>;
	graceMs?: number;
	recheckMs?: number;
}): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let checking = false;
	let woken = false;
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
		try {
			if (!isDown() || (await probe()) !== "stopped" || stopped) return;
			await wake();
			woken = true;
			if (!stopped) bus.reconnect();
		} catch {
			// The wake failed; the next check tries again.
		} finally {
			checking = false;
			if (isDown()) schedule(recheckMs);
		}
	};

	const onStatus = ({ state }: { state: string }) => {
		if (state === "open") {
			woken = false;
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
