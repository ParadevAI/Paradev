import { MAX_WORKSPACE_FORWARDS } from "@superset/shared/realtime";
import type { PortForward } from "shared/types";
import { WebSocket } from "ws";

const DEFAULT_TIMING = {
	pingMs: 25_000,
	retryMinMs: 2_000,
	retryMaxMs: 60_000,
	/** How long a socket must stay up before a drop counts as fresh trouble. */
	stableMs: 30_000,
	handshakeMs: 10_000,
};

// Not 4403: access can be granted later, so "no access" only backs off.
const REFUSED_CODES = new Set([4401]);

interface Channel {
	url: string;
	socket: WebSocket | null;
	sent: string | null;
	payload: string;
	retryMs: number;
	retryTimer: ReturnType<typeof setTimeout> | null;
	pingTimer: ReturnType<typeof setInterval> | null;
	openedAt: number | null;
	refusedToken: string | null;
}

export interface ForwardReporterOptions {
	getToken: () => string | null;
	timing?: Partial<typeof DEFAULT_TIMING>;
}

/** One socket per workspace with forwards; the hub forgets them when it closes. */
export class ForwardReporter {
	private readonly reportUrls = new Map<string, string>();
	private readonly channels = new Map<string, Channel>();
	private readonly timing: typeof DEFAULT_TIMING;

	constructor(private readonly options: ForwardReporterOptions) {
		this.timing = { ...DEFAULT_TIMING, ...options.timing };
	}

	setReportUrl(workspaceId: string, url: string): void {
		this.reportUrls.set(workspaceId, url);
	}

	sync(forwards: PortForward[]): void {
		const byWorkspace = new Map<
			string,
			{ port: number; localPort: number }[]
		>();
		for (const forward of forwards) {
			// A bound forward stays reported through a passing error (a box
			// waking up): it is still where the port will answer.
			if (!forward.explicit || forward.localPort === null) continue;
			const { workspaceId, remotePort } = forward.target;
			if (!this.reportUrls.has(workspaceId)) continue;
			const list = byWorkspace.get(workspaceId) ?? [];
			list.push({ port: remotePort, localPort: forward.localPort });
			byWorkspace.set(workspaceId, list);
		}

		for (const [workspaceId, channel] of this.channels) {
			if (!byWorkspace.has(workspaceId)) this.close(workspaceId, channel);
		}
		for (const [workspaceId, list] of byWorkspace) {
			const url = this.reportUrls.get(workspaceId) as string;
			const payload = JSON.stringify({
				type: "forwards",
				forwards: list
					.sort((a, b) => a.port - b.port)
					.slice(0, MAX_WORKSPACE_FORWARDS),
			});
			const channel =
				this.channels.get(workspaceId) ?? this.open(workspaceId, url);
			channel.payload = payload;
			this.flush(channel);
		}
	}

	stopAll(): void {
		for (const [workspaceId, channel] of this.channels) {
			this.close(workspaceId, channel);
		}
		this.reportUrls.clear();
	}

	private open(workspaceId: string, url: string): Channel {
		const channel: Channel = {
			url,
			socket: null,
			sent: null,
			payload: "",
			retryMs: this.timing.retryMinMs,
			retryTimer: null,
			pingTimer: null,
			openedAt: null,
			refusedToken: null,
		};
		this.channels.set(workspaceId, channel);
		this.connect(workspaceId, channel);
		return channel;
	}

	private connect(workspaceId: string, channel: Channel): void {
		const token = this.options.getToken();
		if (!token || token === channel.refusedToken) {
			this.retry(workspaceId, channel);
			return;
		}
		const address = new URL(channel.url);
		if (address.protocol === "https:") address.protocol = "wss:";
		if (address.protocol === "http:") address.protocol = "ws:";
		const socket = new WebSocket(address.toString(), {
			headers: { authorization: `Bearer ${token}` },
			handshakeTimeout: this.timing.handshakeMs,
		});
		channel.socket = socket;
		channel.sent = null;
		channel.openedAt = null;
		let heardAt = Date.now();
		socket.on("message", (data) => {
			if (String(data) === "pong") heardAt = Date.now();
		});
		socket.on("open", () => {
			channel.openedAt = Date.now();
			heardAt = Date.now();
			channel.pingTimer = setInterval(() => {
				// A half-open socket never closes by itself; the hub would drop
				// this report while it looks connected from here.
				if (Date.now() - heardAt > this.timing.pingMs * 2) {
					socket.terminate();
					return;
				}
				if (socket.readyState === WebSocket.OPEN) socket.send("ping");
			}, this.timing.pingMs);
			this.flush(channel);
		});
		socket.on("close", (code) => {
			if (channel.pingTimer) clearInterval(channel.pingTimer);
			channel.pingTimer = null;
			channel.socket = null;
			// The hub refuses by accepting and then closing, so an open alone
			// says nothing: only a socket that stayed up resets the backoff.
			if (
				channel.openedAt !== null &&
				Date.now() - channel.openedAt >= this.timing.stableMs
			) {
				channel.retryMs = this.timing.retryMinMs;
			}
			if (REFUSED_CODES.has(code)) channel.refusedToken = token;
			if (this.channels.get(workspaceId) === channel) {
				this.retry(workspaceId, channel);
			}
		});
		socket.on("error", () => {});
	}

	private retry(workspaceId: string, channel: Channel): void {
		if (channel.retryTimer) return;
		channel.retryTimer = setTimeout(() => {
			channel.retryTimer = null;
			if (this.channels.get(workspaceId) === channel) {
				this.connect(workspaceId, channel);
			}
		}, channel.retryMs);
		channel.retryMs = Math.min(channel.retryMs * 2, this.timing.retryMaxMs);
	}

	private flush(channel: Channel): void {
		const socket = channel.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		if (channel.sent === channel.payload) return;
		socket.send(channel.payload);
		channel.sent = channel.payload;
	}

	private close(workspaceId: string, channel: Channel): void {
		this.channels.delete(workspaceId);
		if (channel.retryTimer) clearTimeout(channel.retryTimer);
		if (channel.pingTimer) clearInterval(channel.pingTimer);
		channel.socket?.close(1000, "no forwards");
	}
}
