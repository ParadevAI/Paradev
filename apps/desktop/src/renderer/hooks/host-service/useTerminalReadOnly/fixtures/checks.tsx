import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let ownership = Promise.withResolvers<{
	agentLifecycleOwner: "external" | "paradev";
}>();
let boundExternal = false;
type ConnectionState = "open" | "reconnecting";
let connectionState: ConnectionState = "open";
const connectionListeners = new Set<
	(status: { state: ConnectionState }) => void
>();
mock.module("renderer/lib/host-event-bus", () => ({
	getHostEventBus: () => ({
		getConnectionStatus: () => ({ state: connectionState }),
		subscribeConnectionStatus(
			listener: (status: { state: ConnectionState }) => void,
		) {
			connectionListeners.add(listener);
			return () => connectionListeners.delete(listener);
		},
		retain: () => () => {},
	}),
}));
function emitConnection(state: ConnectionState) {
	connectionState = state;
	for (const listener of connectionListeners) listener({ state });
}
mock.module("renderer/hooks/host-service/useTerminalAgentBindings", () => ({
	useTerminalAgentBinding: () =>
		boundExternal ? { agentLifecycleOwner: "external" } : undefined,
}));
mock.module("renderer/hooks/host-service/useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => "http://host",
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		terminal: { getLifecycleOwner: { query: () => ownership.promise } },
	}),
}));

const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { useTerminalReadOnly } = await import("../useTerminalReadOnly");

afterEach(() => {
	cleanup();
	expect(connectionListeners.size).toBe(0);
	connectionState = "open";
	boundExternal = false;
	ownership = Promise.withResolvers<{
		agentLifecycleOwner: "external" | "paradev";
	}>();
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

function renderOwnership() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = renderHook(() => useTerminalReadOnly("workspace", "terminal"), {
		wrapper: ({ children }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
	return { ...view, client };
}

test.each([
	"external",
	"paradev",
] as const)("waits for %s ownership without any agent binding", async (owner) => {
	const view = renderOwnership();
	expect(view.result.current).toBe(true);
	await act(async () => {
		ownership.resolve({ agentLifecycleOwner: owner });
	});
	await waitFor(() => expect(view.client.isFetching()).toBe(0));
	expect(view.result.current).toBe(owner === "external");
	view.client.clear();
});

test("recovers ordinary terminal input after the same host reconnects", async () => {
	connectionState = "reconnecting";
	const view = renderOwnership();
	await act(async () => {
		ownership.reject(new Error("Host unavailable"));
	});
	await waitFor(() => expect(view.client.isFetching()).toBe(0));
	expect(view.result.current).toBe(true);
	ownership = Promise.withResolvers<{
		agentLifecycleOwner: "external" | "paradev";
	}>();
	await act(async () => {
		emitConnection("open");
		ownership.resolve({ agentLifecycleOwner: "paradev" });
	});
	await waitFor(() => expect(view.result.current).toBe(false));
	view.client.clear();
});

test("keeps ordinary terminals usable on hosts without the additive ownership query", async () => {
	const view = renderOwnership();
	expect(view.result.current).toBe(true);
	const missing = Object.assign(new TRPCClientError("No procedure"), {
		data: { code: "NOT_FOUND" },
	});
	await act(async () => {
		ownership.reject(missing);
	});
	await waitFor(() => expect(view.result.current).toBe(false));
	boundExternal = true;
	view.rerender();
	expect(view.result.current).toBe(true);
	view.client.clear();
});
