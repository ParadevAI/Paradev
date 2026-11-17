import type { RealtimeEvent } from "../api-types/api-types.ts";
import { isUnauthorized, retryDelayMs } from "../http/http.ts";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

/** What each channel sends (infra/cloudflare channel-log): `hello` on every connection, then events by seq. */
type Frame =
	| { type: "hello"; channel: string; seq: number; resumed: boolean }
	/** `ephemeral` (someone typing): live only, its seq the channel's latest, so it neither moves nor repeats one. */
	| {
			type: "event";
			channel: string;
			seq: number;
			data: RealtimeEvent;
			ephemeral?: true;
	  };

/** The subprotocol the realtime Worker answers with; the token travels next to it (browsers can't set headers). */
const PROTOCOL = "chats-realtime";
/** The Worker closes a socket whose token ran out with this; the client fetches a fresh token and reconnects. */
const TOKEN_EXPIRED = 4001;
/** A token this close to expiring is replaced before connecting, so a socket doesn't open only to be closed. */
const TOKEN_MARGIN_MS = 30_000;
/** A socket open at least this long dropped by chance, so its channel reconnects without the backoff built up before. */
const STABLE_MS = 30_000;

interface Timing {
	/** Delay before reconnect attempt `n` (1-based); `err` is why the token couldn't be fetched, when that's why. */
	retryMs(attempt: number, err?: unknown): number;
	/** How often open sockets are pinged (the channel answers without waking up). */
	pingMs: number;
	/** A socket that heard nothing, not even a pong, for this long is presumed dead (a laptop that slept) and replaced. */
	silentMs: number;
	/** A resync waits this long for the other channels of a round to say hello, so one bootstrap covers them all. */
	resyncWaitMs: number;
	/** After the app comes back (`check`), a socket that doesn't answer its ping within this long is replaced. */
	probeMs: number;
}

const DEFAULT_TIMING: Timing = {
	retryMs: (n, err) => retryDelayMs(err, n),
	pingMs: 25_000,
	silentMs: 60_000,
	resyncWaitMs: 1_000,
	probeMs: 3_000,
};

/** Seconds-since-epoch expiry from a JWT's payload; 0 (already expired) when it can't be read. */
export function tokenExpiry(token: string): number {
	try {
		const payload = JSON.parse(
			atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
		) as { exp?: unknown };
		return typeof payload.exp === "number" ? payload.exp : 0;
	} catch {
		return 0;
	}
}

/**
 * One frame on a channel whose last seen seq is `lastSeq`. Events at or below it are repeats (dropped); a `hello` that
 * didn't resume means events may be missing and the caller must re-bootstrap. Pure, so the resume rules are testable.
 */
export function readFrame(
	lastSeq: number | null,
	frame: Frame,
): { lastSeq: number; event?: RealtimeEvent; resync?: true } {
	if (frame.type === "hello")
		return frame.resumed
			? { lastSeq: lastSeq ?? frame.seq }
			: { lastSeq: frame.seq, resync: true };
	if (frame.ephemeral)
		return { lastSeq: lastSeq ?? frame.seq, event: frame.data };
	if (lastSeq !== null && frame.seq <= lastSeq) return { lastSeq };
	return { lastSeq: frame.seq, event: frame.data };
}

type Socket = Pick<WebSocket, "send" | "close" | "addEventListener"> & {
	readyState: number;
};
export type SocketFactory = (url: string, protocols: string[]) => Socket;

interface Options {
	/** The Worker's realtime base, e.g. `ws://localhost:8787/realtime`; each channel is a socket at `<url>/<channel>`. */
	url: string;
	/** A token from the API (`/realtime/token`) and the channels it lists. */
	getToken: () => Promise<{ token: string; channels: string[] }>;
	onEvent: (event: RealtimeEvent) => void;
	onState: (state: ConnectionState) => void;
	/** Whether sockets pinged by `check` are still to answer: they may have died while the app was away. */
	onChecking?: (checking: boolean) => void;
	/** Events may have been missed and can't be replayed (a first connection, or a gap older than a channel keeps). */
	onResync: () => void;
	onUnauthorized: () => void;
	socket?: SocketFactory;
	timing?: Timing;
	now?: () => number;
}

interface Ticket {
	token: string;
	channels: string[];
	/** Seconds since the epoch. */
	exp: number;
}

interface Channel {
	name: string;
	socket: Socket | null;
	/** The last event seq this client has; sent as `since` on reconnect so the channel replays only what's missing. */
	lastSeq: number | null;
	/** Hello received on the current socket. */
	open: boolean;
	/** When the current socket said hello: only one that stayed up resets the backoff. */
	openedAt: number | null;
	attempt: number;
	retry: ReturnType<typeof setTimeout> | null;
	heardAt: number;
	/** The socket `check` pinged and is waiting to hear from; cleared by anything it sends. */
	probing: Socket | null;
}

/**
 * Live events from the realtime Worker: one websocket per channel the token lists. Each reconnects with backoff and
 * resumes from its last seq, so a short drop replays exactly what was missed; only a first connection or a gap too old
 * to replay asks for a re-bootstrap (`onResync`). `refresh` fetches a new token after the user's groups change, opening
 * the new channels and closing the ones they left.
 */
export function connectRealtime(opts: Options) {
	const timing = opts.timing ?? DEFAULT_TIMING;
	const now = opts.now ?? Date.now;
	const open: SocketFactory =
		opts.socket ?? ((url, protocols) => new WebSocket(url, protocols));
	const base = opts.url.replace(/\/+$/, "");
	const channels = new Map<string, Channel>();
	let ticket: Ticket | null = null;
	let fetching: Promise<Ticket> | null = null;
	let tokenFailure: { err: unknown; failures: number; until: number } | null =
		null;
	let stopped = false;
	let everConnected = false;
	let resyncTimer: ReturnType<typeof setTimeout> | null = null;
	let resyncWanted = false;
	let checking = false;

	const report = () => {
		const all = [...channels.values()];
		const connected = all.length > 0 && all.every((c) => c.open);
		if (connected) everConnected = true;
		// The resync's bootstrap starts before "connected" is heard, so a status built from both never reads live between.
		if (connected && resyncWanted) fireResync();
		opts.onState(
			connected ? "connected" : everConnected ? "reconnecting" : "connecting",
		);
		reportChecking();
	};

	function reportChecking() {
		const probing = [...channels.values()].some((c) => c.probing !== null);
		if (probing === checking) return;
		checking = probing;
		opts.onChecking?.(probing);
	}

	function fireResync() {
		resyncWanted = false;
		if (resyncTimer) clearTimeout(resyncTimer);
		resyncTimer = null;
		opts.onResync();
	}

	/** One bootstrap per round of (re)connections: when every channel is open, or after a short wait if one lags. */
	function wantResync() {
		resyncWanted = true;
		resyncTimer ??= setTimeout(fireResync, timing.resyncWaitMs);
	}

	function stop() {
		stopped = true;
		for (const channel of channels.values()) close(channel);
		channels.clear();
		if (resyncTimer) clearTimeout(resyncTimer);
		clearInterval(heartbeat);
	}

	/**
	 * A current token, fetching one (once, however many channels ask) when there's none or it's about to expire. After a
	 * failed fetch the channels share one backoff: until it's over they get the same error without asking the API again.
	 */
	async function currentTicket(): Promise<Ticket> {
		if (ticket && ticket.exp * 1000 - now() > TOKEN_MARGIN_MS) return ticket;
		if (tokenFailure && now() < tokenFailure.until) throw tokenFailure.err;
		fetching ??= opts
			.getToken()
			.then(
				(t) => {
					tokenFailure = null;
					ticket = { ...t, exp: tokenExpiry(t.token) };
					return ticket;
				},
				(err: unknown) => {
					const failures = (tokenFailure?.failures ?? 0) + 1;
					tokenFailure = {
						err,
						failures,
						until: now() + timing.retryMs(failures, err),
					};
					throw err;
				},
			)
			.finally(() => (fetching = null));
		return fetching;
	}

	/**
	 * Lets go of the channel's socket. Its close event is ignored from here on: a socket closed from this side reports
	 * closing only once the other side answers, which a dead connection never does.
	 */
	function close(channel: Channel) {
		if (channel.retry) clearTimeout(channel.retry);
		channel.retry = null;
		const socket = channel.socket;
		channel.socket = null;
		channel.open = false;
		channel.probing = null;
		socket?.close();
	}

	function scheduleReconnect(channel: Channel, err?: unknown) {
		if (stopped || channel.retry || !channels.has(channel.name)) return;
		// A channel that says hello and drops at once (an evicted or refusing channel) keeps backing off.
		if (channel.openedAt !== null && now() - channel.openedAt >= STABLE_MS)
			channel.attempt = 0;
		channel.openedAt = null;
		channel.attempt++;
		channel.retry = setTimeout(
			() => {
				channel.retry = null;
				void connect(channel);
			},
			timing.retryMs(channel.attempt, err),
		);
	}

	async function connect(channel: Channel) {
		let current: Ticket;
		try {
			current = await currentTicket();
		} catch (err) {
			if (isUnauthorized(err)) {
				stop();
				return opts.onUnauthorized();
			}
			return scheduleReconnect(channel, err);
		}
		if (stopped || !channels.has(channel.name)) return;
		// The new token no longer lists this channel (the user left the group).
		if (!current.channels.includes(channel.name)) return sync(current.channels);
		const since = channel.lastSeq === null ? "" : `?since=${channel.lastSeq}`;
		const socket = open(`${base}/${encodeURIComponent(channel.name)}${since}`, [
			PROTOCOL,
			current.token,
		]);
		channel.socket = socket;
		channel.heardAt = now();
		socket.addEventListener("message", (message) => {
			if (channel.socket !== socket) return;
			channel.heardAt = now();
			if (channel.probing) {
				channel.probing = null;
				reportChecking();
			}
			if (message.data === "pong") return;
			const frame = JSON.parse(String(message.data)) as Frame;
			const read = readFrame(channel.lastSeq, frame);
			channel.lastSeq = read.lastSeq;
			if (frame.type === "hello") {
				channel.open = true;
				channel.openedAt = now();
				if (read.resync) wantResync();
				report();
			}
			if (read.event) opts.onEvent(read.event);
		});
		socket.addEventListener("close", (event) => {
			if (channel.socket !== socket) return;
			const wasOpen = channel.open;
			channel.socket = null;
			channel.open = false;
			// An expired token, or a refused upgrade (which looks like a close before any hello): try a fresh token.
			if ((event as CloseEvent).code === TOKEN_EXPIRED || !wasOpen)
				ticket = null;
			report();
			scheduleReconnect(channel);
		});
	}

	/** Opens channels the token lists that aren't open yet and closes the ones it no longer lists. */
	function sync(names: string[]) {
		for (const [name, channel] of channels) {
			if (names.includes(name)) continue;
			close(channel);
			channels.delete(name);
		}
		for (const name of names) {
			if (channels.has(name)) continue;
			const channel: Channel = {
				name,
				socket: null,
				lastSeq: null,
				open: false,
				openedAt: null,
				attempt: 0,
				retry: null,
				heardAt: now(),
				probing: null,
			};
			channels.set(name, channel);
			void connect(channel);
		}
		report();
	}

	/** Replaces the channel's socket now, without the backoff a drop waits for, resuming from its last seq. */
	function reconnectNow(channel: Channel) {
		close(channel);
		channel.attempt = 0;
		channel.openedAt = null;
		report();
		void connect(channel);
	}

	/**
	 * The app came back to the foreground (or the window got focus). A suspended app's sockets may have died without a
	 * close event, which the heartbeat would notice only after `silentMs`; so each socket is pinged now and replaced if it
	 * says nothing within `probeMs`, and a channel waiting out its backoff reconnects at once.
	 */
	function check() {
		if (stopped) return;
		const probed: Channel[] = [];
		for (const channel of channels.values()) {
			const socket = channel.socket;
			if (!socket) {
				if (channel.retry) reconnectNow(channel);
				continue;
			}
			if (socket.readyState === 1) socket.send("ping");
			else if (socket.readyState !== 0) {
				reconnectNow(channel);
				continue;
			}
			// A socket still connecting gets as long as an open one to say something (its hello).
			channel.probing = socket;
			probed.push(channel);
		}
		reportChecking();
		if (!probed.length) return;
		setTimeout(() => {
			for (const channel of probed) {
				if (stopped || !channels.has(channel.name)) continue;
				if (channel.socket && channel.probing === channel.socket)
					reconnectNow(channel);
			}
		}, timing.probeMs);
	}

	const heartbeat = setInterval(() => {
		for (const channel of channels.values()) {
			if (!channel.socket || channel.socket.readyState !== 1) continue;
			if (now() - channel.heardAt > timing.silentMs) {
				close(channel);
				report();
				scheduleReconnect(channel);
			} else channel.socket.send("ping");
		}
	}, timing.pingMs);

	async function refresh() {
		// A token already on its way may predate the group change; wait it out and ask for a fresh one.
		await fetching?.catch(() => {});
		ticket = null;
		try {
			const current = await currentTicket();
			if (!stopped) sync(current.channels);
		} catch (err) {
			if (!isUnauthorized(err)) throw err;
			stop();
			opts.onUnauthorized();
		}
	}

	opts.onState("connecting");
	void refresh().catch((first: unknown) => {
		// The API is unreachable; try again like a dropped channel would.
		const retry = (attempt: number, err: unknown) =>
			setTimeout(
				() => {
					if (stopped || channels.size) return;
					void refresh().catch((next: unknown) => retry(attempt + 1, next));
				},
				timing.retryMs(attempt, err),
			);
		retry(1, first);
	});

	return {
		disconnect: stop,
		refresh: () => void refresh().catch(() => {}),
		check,
	};
}
