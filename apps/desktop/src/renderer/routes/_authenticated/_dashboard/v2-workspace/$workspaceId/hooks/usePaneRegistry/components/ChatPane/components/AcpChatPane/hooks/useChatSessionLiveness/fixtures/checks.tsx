import { afterAll, afterEach, expect, jest, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { Trans } from "@lingui/react/macro";
import type { ChatTransport } from "@superset/chat/client";
import type { HostConnectionStatus } from "@superset/workspace-client";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";

const nativeTimers = {
	setTimeout: globalThis.setTimeout,
	clearTimeout: globalThis.clearTimeout,
	setInterval: globalThis.setInterval,
	clearInterval: globalThis.clearInterval,
	queueMicrotask: globalThis.queueMicrotask,
};
const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
Object.assign(globalThis, nativeTimers);
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type State = "connecting" | "open" | "reconnecting";
type Session = Awaited<ReturnType<ChatTransport["getSession"]>>;
const live: Session = { live: true, session: null, cursor: null };
const stopped: Session = { live: false, session: null, cursor: null };
let hostUrl = "https://sandbox-a";

function makeHost() {
	let status: HostConnectionStatus = { state: "open", since: 0, probe: null };
	let refs = 0;
	const listeners = new Set<(status: HostConnectionStatus) => void>();
	return {
		read: async (): Promise<Session> => live,
		getConnectionStatus: () => status,
		subscribeConnectionStatus(
			callback: (status: HostConnectionStatus) => void,
		) {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
		retain() {
			refs++;
			return () => refs--;
		},
		emit(next: State) {
			status = { state: next, since: status.since + 1, probe: null };
			for (const listener of listeners) listener(status);
		},
		get retained() {
			return refs;
		},
		get subscribers() {
			return listeners.size;
		},
	};
}

const hosts = new Map<string, ReturnType<typeof makeHost>>();
mock.module("renderer/lib/host-event-bus", () => ({
	getHostEventBus: (url: string) => hosts.get(url),
}));
mock.module("../../../../../../ChatSession/constants", () => ({
	CHAT_COLUMN_CLASSNAME: "",
	CHAT_GUTTER_CLASSNAME: "",
}));
if (!registered) {
	mock.module("@lingui/core/macro", () => ({
		msg: ({ message }: { message: string }) => ({ id: message, message }),
	}));
	mock.module("@lingui/react/macro", () => ({
		Trans: ({ children }: { children?: unknown }) => children,
	}));
}
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { useChatSessionLiveness } = await import("../useChatSessionLiveness");
const { ConnectionNotice } = await import(
	"../../../../../../ChatSession/components/ConnectionNotice"
);
const transport = {
	getSession: async () => {
		const host = hosts.get(hostUrl);
		if (!host) throw new Error(`Missing host ${hostUrl}`);
		return host.read();
	},
};
let current: ReturnType<typeof useChatSessionLiveness>;
const renderedChecks: boolean[] = [];
function Probe() {
	current = useChatSessionLiveness({
		hostUrl,
		sessionId: "chat",
		transport,
	});
	renderedChecks.push(current.checking);
	return current.checking ? (
		<ConnectionNotice>
			<Trans>Resuming the conversation…</Trans>
		</ConnectionNotice>
	) : null;
}
function tree(client: QueryClientType) {
	return (
		<QueryClientProvider client={client}>
			<Probe />
		</QueryClientProvider>
	);
}
const clients: QueryClientType[] = [];
function client() {
	const next = new QueryClient({
		defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
	});
	clients.push(next);
	return next;
}
function deferredSession() {
	let resolve: (session: Session) => void = () => {};
	const promise = new Promise<Session>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

afterEach(() => {
	cleanup();
	for (const next of clients.splice(0)) next.clear();
	for (const host of hosts.values()) {
		expect(host.retained).toBe(0);
		expect(host.subscribers).toBe(0);
	}
	hosts.clear();
	renderedChecks.length = 0;
	hostUrl = "https://sandbox-a";
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test("a waking box shows the resume notice immediately without a tab switch", async () => {
	const host = makeHost();
	host.emit("connecting");
	const pending = deferredSession();
	let reads = 0;
	host.read = () => {
		reads++;
		return pending.promise;
	};
	hosts.set(hostUrl, host);
	const queryClient = client();
	queryClient.setQueryData(
		["acp-chat-session", "chat", hostUrl, host.getConnectionStatus()],
		live,
	);
	const view = render(tree(queryClient));
	expect(renderedChecks[0]).toBe(true);
	expect(view.getByText("Resuming the conversation…")).toBeTruthy();
	expect(current.checking).toBe(true);
	expect(current.stored).toBeUndefined();
	expect(reads).toBe(0);
	await act(async () => host.emit("open"));
	expect(view.getByText("Resuming the conversation…")).toBeTruthy();
	expect(reads).toBe(1);
	await act(async () => pending.resolve(stopped));
	await waitFor(() => expect(current.stored?.live).toBe(false));
});

test("reopening a chat on the same connection stays usable and rechecks in the background", async () => {
	const host = makeHost();
	const pending = deferredSession();
	let reads = 0;
	host.read = () => {
		reads++;
		return pending.promise;
	};
	hosts.set(hostUrl, host);
	const queryClient = client();
	queryClient.setQueryData(
		["acp-chat-session", "chat", hostUrl, host.getConnectionStatus()],
		live,
	);
	render(tree(queryClient));
	expect(renderedChecks[0]).toBe(false);
	expect(current.stored?.live).toBe(true);
	expect(reads).toBe(1);
	await act(async () => pending.resolve(stopped));
	await waitFor(() => {
		expect(current.checking).toBe(false);
		expect(current.stored?.live).toBe(false);
	});
	expect(renderedChecks).not.toContain(true);
});

test("a reconnect rechecks liveness without a sessions-changed event", async () => {
	const host = makeHost();
	hosts.set(hostUrl, host);
	render(tree(client()));
	await waitFor(() => expect(current.stored?.live).toBe(true));
	const pending = deferredSession();
	host.read = () => pending.promise;
	await act(async () => host.emit("reconnecting"));
	expect(current.checking).toBe(true);
	expect(current.stored).toBeUndefined();
	await act(async () => host.emit("open"));
	await waitFor(() => {
		expect(current.checking).toBe(true);
		expect(current.stored).toBeUndefined();
	});
	await act(async () => pending.resolve(stopped));
	await waitFor(() => expect(current.stored?.live).toBe(false));
});

test("a routine background check keeps the verified chat available", async () => {
	const host = makeHost();
	hosts.set(hostUrl, host);
	const queryClient = client();
	render(tree(queryClient));
	await waitFor(() => expect(current.stored?.live).toBe(true));
	const pending = deferredSession();
	host.read = () => pending.promise;
	let refreshed: Promise<void> = Promise.resolve();
	await act(async () => {
		refreshed = queryClient.invalidateQueries({
			queryKey: ["acp-chat-session", "chat"],
		});
	});
	expect(current.checking).toBe(false);
	expect(current.stored?.live).toBe(true);
	await act(async () => {
		pending.resolve(stopped);
		await refreshed;
	});
	await waitFor(() => expect(current.stored?.live).toBe(false));
});

test("a new sandbox address cannot reuse the previous process's liveness", async () => {
	const oldHost = makeHost();
	hosts.set(hostUrl, oldHost);
	const queryClient = client();
	const view = render(tree(queryClient));
	await waitFor(() => expect(current.stored?.live).toBe(true));
	const newHost = makeHost();
	const pending = deferredSession();
	newHost.read = () => pending.promise;
	hostUrl = "https://sandbox-b";
	hosts.set(hostUrl, newHost);
	view.rerender(tree(queryClient));
	expect(current.checking).toBe(true);
	expect(current.stored).toBeUndefined();
	await act(async () => pending.resolve(stopped));
	await waitFor(() => expect(current.stored?.live).toBe(false));
});

test("a failed liveness check recovers without another connection event", async () => {
	jest.useFakeTimers();
	try {
		const host = makeHost();
		let attempts = 0;
		host.read = async () => {
			attempts++;
			throw new Error("HTTP is temporarily unavailable");
		};
		hosts.set(hostUrl, host);
		const queryClient = client();
		queryClient.setQueryDefaults(["acp-chat-session"], {
			retry: 2,
			retryDelay: 10,
		});
		await act(async () => {
			render(tree(queryClient));
		});
		await act(async () => jest.advanceTimersByTime(10));
		await act(async () => jest.advanceTimersByTime(10));
		await act(async () => jest.advanceTimersByTime(0));
		expect(attempts).toBe(3);
		expect(current.checking).toBe(true);
		expect(current.stored).toBeUndefined();
		expect(
			queryClient.getQueryState([
				"acp-chat-session",
				"chat",
				hostUrl,
				host.getConnectionStatus(),
			])?.status,
		).toBe("error");
		host.read = async () => live;
		await act(async () => jest.advanceTimersByTime(2_000));
		await act(async () => jest.advanceTimersByTime(0));
		expect(current.checking).toBe(false);
		expect(current.stored?.live).toBe(true);
	} finally {
		cleanup();
		jest.useRealTimers();
	}
});

test("a failed liveness check does not expose the cached live process", async () => {
	const host = makeHost();
	host.read = async () => {
		throw new Error("sandbox is waking up");
	};
	hosts.set(hostUrl, host);
	const queryClient = client();
	const queryKey = [
		"acp-chat-session",
		"chat",
		hostUrl,
		host.getConnectionStatus(),
	];
	queryClient.setQueryData(queryKey, live);
	render(tree(queryClient));
	await waitFor(() =>
		expect(queryClient.getQueryState(queryKey)?.status).toBe("error"),
	);
	expect(current.checking).toBe(true);
	expect(current.stored).toBeUndefined();
});
