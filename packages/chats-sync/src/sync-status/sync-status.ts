import type { ConnectionState } from "../realtime/realtime.ts";

/**
 * Whether what the app shows is current, as WhatsApp's title says it: `connecting` while a channel is down, being
 * replaced, or not yet known to be alive after the app was away; `updating` while a bootstrap catches the state up
 * (after a gap too old to replay, or over a cached state at launch); else `live`.
 */
export type SyncStatus = "live" | "connecting" | "updating";

/** What the status is made from: the realtime connection, its foreground check, and a bootstrap on its way. */
export interface SyncConditions {
	connection: ConnectionState;
	/** Sockets pinged after the app came back that haven't answered yet (they may have died while it was away). */
	checking: boolean;
	/** A bootstrap is on its way: the state shown may be behind until it lands. */
	catchingUp: boolean;
}

export function syncStatusOf(c: SyncConditions): SyncStatus {
	if (c.connection !== "connected" || c.checking) return "connecting";
	return c.catchingUp ? "updating" : "live";
}

/** The words the apps put in place of a title while not live; null when live. */
export function syncStatusLabel(status: SyncStatus): string | null {
	if (status === "connecting") return "Connecting…";
	if (status === "updating") return "Updating…";
	return null;
}

/** A blip shorter than this (a ping answered at once, a quick reconnect) never shows. */
export const SYNC_STATUS_DELAY_MS = 1_000;

interface Timers {
	setTimeout: (fn: () => void, ms: number) => unknown;
	clearTimeout: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * The status the apps show, from conditions as they change. Leaving `live` shows only once it has lasted `delayMs`;
 * coming back to `live`, or moving between `connecting` and `updating` once shown, shows at once. `onChange` hears
 * each shown change (not the first, `live`).
 */
export function createSyncStatus(opts: {
	onChange: (status: SyncStatus) => void;
	initial?: Partial<SyncConditions>;
	delayMs?: number;
	timers?: Timers;
}) {
	const timers = opts.timers ?? REAL_TIMERS;
	const delayMs = opts.delayMs ?? SYNC_STATUS_DELAY_MS;
	let conditions: SyncConditions = {
		connection: "connected",
		checking: false,
		catchingUp: false,
		...opts.initial,
	};
	let shown: SyncStatus = "live";
	let pending: unknown = null;
	let stopped = false;

	const show = (status: SyncStatus) => {
		if (status === shown) return;
		shown = status;
		opts.onChange(status);
	};
	const cancel = () => {
		if (pending !== null) timers.clearTimeout(pending);
		pending = null;
	};

	function evaluate() {
		if (stopped) return;
		const next = syncStatusOf(conditions);
		if (next === "live") {
			cancel();
			return show("live");
		}
		if (shown !== "live") return show(next);
		pending ??= timers.setTimeout(() => {
			pending = null;
			if (!stopped) show(syncStatusOf(conditions));
		}, delayMs);
	}

	evaluate();
	return {
		set(change: Partial<SyncConditions>) {
			conditions = { ...conditions, ...change };
			evaluate();
		},
		get: () => shown,
		stop() {
			stopped = true;
			cancel();
		},
	};
}
