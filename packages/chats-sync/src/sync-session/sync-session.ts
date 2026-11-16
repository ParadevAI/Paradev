import type { ChatState } from "@superset/chats-core";
import type { RealtimeEvent, SyncSignal } from "../api-types/api-types.ts";
import { replayEvents } from "../apply-event/apply-event.ts";
import { fromBootstrap } from "../from-api/from-api.ts";
import { isUnauthorized } from "../http/http.ts";
import {
	type ConnectionState,
	connectRealtime,
	type SocketFactory,
} from "../realtime/realtime.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";
import {
	createSyncStatus,
	type SyncStatus,
} from "../sync-status/sync-status.ts";

/** A failed bootstrap's retries: quick at first (a blip), then every half minute. */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

interface Deps {
	api: Pick<SyncApi, "bootstrap" | "realtimeToken">;
	/** The realtime Worker's channels, e.g. `ws://localhost:8787/realtime`. */
	realtimeUrl: string;
	/** A fresh `/bootstrap` (events heard while it was in flight replayed on top) and the clientIds the server has. */
	onSnapshot: (fresh: ChatState, confirmedClientIds: Set<string>) => void;
	/** A bootstrap failed for a reason other than the session (offline, server down). */
	onLoadError: () => void;
	/** A realtime event to apply to the state. */
	onEvent: (event: RealtimeEvent) => void;
	/** For live views: every event and each bootstrap, after the state has them. */
	signal: (signal: SyncSignal) => void;
	onConnection: (state: ConnectionState) => void;
	/** What the app's titles say while it isn't live (`connecting`, `updating`), short blips left out. */
	onStatus?: (status: SyncStatus) => void;
	/** How long a status must last to show (`SYNC_STATUS_DELAY_MS` by default). */
	statusDelayMs?: number;
	/** How long to wait before trying a failed bootstrap again, one per attempt in a row, the last repeating. */
	retryDelaysMs?: number[];
	onUnauthorized: () => void;
	socket?: SocketFactory;
}

/**
 * Keeps a client's state in step with the server: bootstraps, then applies realtime events. Channels resume by seq
 * after a drop, replaying what was missed; a first connection, or a gap older than a channel keeps, re-bootstraps
 * instead (replays of events already applied are harmless: applying events is idempotent). `refresh` re-bootstraps on
 * demand (e.g. a Retry button); `groupsChanged` does what the server's `groups.changed` does, for a client that just
 * joined or created a chat and shouldn't wait on realtime to see it whole and hear it; `resume` checks the sockets when
 * the app comes back to the foreground.
 */
export function startSync(deps: Deps) {
	const retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
	let failures = 0;
	let retry: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	// Bootstraps can overlap (start + realtime connect); only the most recently started one may land.
	let refreshSeq = 0;
	// Events heard while the latest bootstrap is in flight: its snapshot may predate them, so they're replayed on top.
	let inFlight: RealtimeEvent[] | null = null;
	// Until the snapshot is applied the state shown may be behind (a cached one at launch, or a gap too old to replay).
	const status = createSyncStatus({
		onChange: (s) => deps.onStatus?.(s),
		initial: { connection: "connecting", catchingUp: true },
		delayMs: deps.statusDelayMs,
	});

	async function refresh() {
		if (retry) clearTimeout(retry);
		retry = null;
		const seq = ++refreshSeq;
		const requestedAt = Date.now();
		const heard: RealtimeEvent[] = [];
		inFlight = heard;
		status.set({ catchingUp: true });
		try {
			const data = await deps.api.bootstrap();
			if (seq !== refreshSeq) return;
			inFlight = null;
			deps.signal({ type: "bootstrapped", devs: data.devs, requestedAt });
			const confirmedClientIds = new Set(
				data.messages.flatMap((m) => (m.clientId ? [m.clientId] : [])),
			);
			deps.onSnapshot(
				replayEvents(fromBootstrap(data), heard),
				confirmedClientIds,
			);
			failures = 0;
			status.set({ catchingUp: false });
		} catch (err) {
			if (seq !== refreshSeq) return;
			inFlight = null;
			if (isUnauthorized(err)) {
				status.set({ catchingUp: false });
				return deps.onUnauthorized();
			}
			// What's shown (a cached state, or one from before the gap) is still behind: it keeps reading updating, and the
			// bootstrap is tried again, sooner at first, until one lands.
			deps.onLoadError();
			if (stopped) return;
			const delay = retryDelays[Math.min(failures, retryDelays.length - 1)]!;
			failures++;
			retry = setTimeout(() => void refresh(), delay);
		}
	}

	/** Joined, created or left a group: a new token lists the new channels, and a bootstrap brings the groups. */
	function groupsChanged() {
		realtime.refresh();
		void refresh();
	}

	void refresh();
	const realtime = connectRealtime({
		url: deps.realtimeUrl,
		getToken: deps.api.realtimeToken,
		onEvent: (event) => {
			if (event.type === "groups.changed") return groupsChanged();
			// The event drops the group; a new token, which no longer lists its channel, closes that.
			if (event.type === "group.deleted") realtime.refresh();
			deps.onEvent(event);
			inFlight?.push(event);
			deps.signal({ type: "event", event, at: Date.now() });
		},
		onState: (connection) => {
			status.set({ connection });
			deps.onConnection(connection);
		},
		onChecking: (checking) => status.set({ checking }),
		onResync: () => void refresh(),
		onUnauthorized: deps.onUnauthorized,
		socket: deps.socket,
	});

	return {
		refresh,
		groupsChanged,
		resume: realtime.check,
		stop: () => {
			stopped = true;
			if (retry) clearTimeout(retry);
			status.stop();
			realtime.disconnect();
		},
	};
}
