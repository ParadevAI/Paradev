import {
	createRelaySocket,
	type RelaySocketOptions,
} from "@superset/workspace-client/relay-socket";

interface UsageSocket {
	addEventListener(
		type: "open" | "message",
		listener: (event: unknown) => void,
	): void;
	removeEventListener(
		type: "open" | "message",
		listener: (event: unknown) => void,
	): void;
	close(): void;
}
interface UsageSource {
	hostUrl: string;
	key: string;
	getToken(): string | null;
}
interface Owner {
	key: string;
	hostUrl: string;
	socket: UsageSocket | null;
	onOpen(event: unknown): void;
	onMessage(event: unknown): void;
	dirty: boolean;
	reading: boolean;
	getToken(): string | null;
	timer?: unknown;
}
function eventsUrl(hostUrl: string): string | null {
	try {
		const url = new URL(hostUrl);
		return url.protocol === "http:" &&
			["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
			!url.username &&
			!url.password &&
			(url.pathname === "/" || url.pathname === "") &&
			!url.search &&
			!url.hash
			? new URL("/events", url).href
			: null;
	} catch {
		return null;
	}
}
function isClaudeUsageUpdate(event: unknown): boolean {
	if (
		!event ||
		typeof event !== "object" ||
		!("data" in event) ||
		typeof event.data !== "string" ||
		event.data.length > 1024
	)
		return false;
	try {
		const value = JSON.parse(event.data);
		return (
			!!value &&
			value.type === "usage:changed" &&
			value.provider === "claude" &&
			typeof value.occurredAt === "number" &&
			Number.isFinite(value.occurredAt) &&
			value.occurredAt >= 0
		);
	} catch {
		return false;
	}
}
export function createNativeUsageUpdates({
	read,
	createSocket = createRelaySocket,
	schedule = (run, delay) => setTimeout(run, delay),
	cancel = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: {
	read(hostUrl: string): Promise<unknown>;
	createSocket?: (options: RelaySocketOptions) => UsageSocket;
	schedule?: (run: () => void, delay: number) => unknown;
	cancel?: (timer: unknown) => void;
}) {
	const owners = new Map<string, Owner>();
	const current = (owner: Owner) => owners.get(owner.hostUrl) === owner;
	function authorized(owner: Owner) {
		if (!current(owner)) return false;
		try {
			if (owner.getToken()) return true;
		} catch {}
		close(owner.hostUrl);
		return false;
	}
	function request(owner: Owner) {
		if (!authorized(owner)) return;
		owner.dirty = true;
		if (owner.timer !== undefined || owner.reading) return;
		owner.timer = schedule(() => {
			owner.timer = undefined;
			void drain(owner);
		}, 200);
	}
	async function drain(owner: Owner) {
		if (!authorized(owner) || owner.reading || !owner.dirty) return;
		owner.dirty = false;
		owner.reading = true;
		try {
			await read(owner.hostUrl);
		} catch {
			// The common snapshot retains its last reading; the normal clock retries.
		} finally {
			owner.reading = false;
			if (current(owner) && owner.dirty) request(owner);
		}
	}
	function close(hostUrl: string) {
		const owner = owners.get(hostUrl);
		if (!owner) return;
		owners.delete(hostUrl);
		if (owner.timer !== undefined) cancel(owner.timer);
		owner.dirty = false;
		owner.socket?.removeEventListener("open", owner.onOpen);
		owner.socket?.removeEventListener("message", owner.onMessage);
		owner.socket?.close();
	}
	return {
		observe(source: UsageSource): boolean {
			const url = eventsUrl(source.hostUrl);
			if (!url) return false;
			if (owners.get(source.hostUrl)?.key === source.key) return true;
			close(source.hostUrl);
			if (owners.size >= 128) return false;
			const owner: Owner = {
				hostUrl: source.hostUrl,
				key: source.key,
				socket: null,
				dirty: false,
				reading: false,
				getToken: source.getToken,
				onOpen: () => request(owner),
				onMessage: (event) => {
					if (isClaudeUsageUpdate(event)) request(owner);
				},
			};
			owners.set(source.hostUrl, owner);
			try {
				owner.socket = createSocket({
					buildUrl: () => url,
					getToken: () => (current(owner) ? source.getToken() : null),
					minReconnectionDelay: 1000,
					maxReconnectionDelay: 30_000,
					maxEnqueuedMessages: 0,
				});
				owner.socket.addEventListener("open", owner.onOpen);
				owner.socket.addEventListener("message", owner.onMessage);
				return true;
			} catch {
				close(source.hostUrl);
				return false;
			}
		},
		close,
		clear() {
			for (const url of [...owners.keys()]) close(url);
		},
	};
}
