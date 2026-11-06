import type { MobileDevicePlatform } from "../../../db/schema";

export interface DeviceRef {
	platform: MobileDevicePlatform;
	/** A simulator's udid. An emulator's serial exists only while it runs, so
	 * an emulator is keyed by its AVD name. */
	key: string;
}

export interface OwnedDeviceStore {
	list(): DeviceRef[];
	add(device: DeviceRef): void;
	remove(device: DeviceRef): void;
}

/** How long a device stays up after its last pane lets go, so a pane that
 * remounts or moves to another tab keeps it. Emulators boot slowly. */
export const RELEASE_GRACE_MS: Record<MobileDevicePlatform, number> = {
	ios: 10_000,
	android: 60_000,
};

/** A pane that stops holding without letting go (a crashed or frozen window)
 * loses its hold after this. Timers in a hidden window can slow to one a
 * minute, so it must be well over a minute. */
export const HOLD_TIMEOUT_MS = 120_000;

interface DeviceState {
	holders: Map<string, number>;
	releasedAt: number;
	seenRunning: boolean;
}

const deviceId = (device: DeviceRef) => `${device.platform}:${device.key}`;

/**
 * Shuts down the simulators and emulators this host booted once no pane holds
 * them. Devices something else started are never touched.
 */
export function createDeviceLifecycle<Running extends DeviceRef>({
	store,
	now,
	shutdown,
}: {
	store: OwnedDeviceStore;
	now: () => number;
	shutdown: (device: Running) => Promise<void>;
}) {
	const startedAt = now();
	const states = new Map<string, DeviceState>();

	const stateOf = (device: DeviceRef): DeviceState => {
		let state = states.get(deviceId(device));
		if (!state) {
			state = { holders: new Map(), releasedAt: startedAt, seenRunning: false };
			states.set(deviceId(device), state);
		}
		return state;
	};

	const forget = (device: DeviceRef) => {
		store.remove(device);
		states.delete(deviceId(device));
	};

	return {
		hold(device: DeviceRef, holder: string) {
			stateOf(device).holders.set(holder, now() + HOLD_TIMEOUT_MS);
		},

		release(device: DeviceRef, holder: string) {
			const state = stateOf(device);
			state.holders.delete(holder);
			if (state.holders.size === 0) state.releasedAt = now();
		},

		/** Records a device this host is about to boot. */
		claim(device: DeviceRef) {
			store.add(device);
			stateOf(device).releasedAt = now();
		},

		/** Stops tracking a device, for one the user shut down themselves. */
		forget,

		owned: () => store.list(),

		async sweep(running: Running[]) {
			const runningById = new Map(running.map((d) => [deviceId(d), d]));
			const time = now();
			for (const device of store.list()) {
				const state = stateOf(device);
				for (const [holder, expiresAt] of state.holders) {
					if (expiresAt <= time) state.holders.delete(holder);
				}
				const current = runningById.get(deviceId(device));
				if (!current) {
					const neverCameUp =
						state.holders.size === 0 &&
						time - state.releasedAt >= HOLD_TIMEOUT_MS;
					if (state.seenRunning || neverCameUp) forget(device);
					continue;
				}
				state.seenRunning = true;
				if (state.holders.size > 0) continue;
				if (time - state.releasedAt < RELEASE_GRACE_MS[device.platform]) {
					continue;
				}
				try {
					await shutdown(current);
					forget(device);
				} catch {
					// Kept, so the next sweep tries again.
				}
			}
		},
	};
}

export type DeviceLifecycle<Running extends DeviceRef> = ReturnType<
	typeof createDeviceLifecycle<Running>
>;
