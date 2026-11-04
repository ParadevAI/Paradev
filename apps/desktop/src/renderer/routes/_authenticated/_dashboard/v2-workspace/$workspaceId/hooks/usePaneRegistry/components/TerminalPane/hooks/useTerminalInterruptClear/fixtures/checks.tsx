import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let lifecycleOwner: "paradev" | "external" | undefined;
let workerStatus = "working";
const listeners = new Set<(event: { domEvent: KeyboardEvent }) => void>();

mock.module("renderer/hooks/host-service/useTerminalAgentBindings", () => ({
	useTerminalAgentBinding: () => ({
		lastEventType: "Start",
		agentLifecycleOwner: lifecycleOwner,
	}),
	getTerminalAgentBindingsQueryKey: () => [
		"terminal-agent-bindings",
		"workspace",
	],
}));
mock.module("renderer/hooks/host-service/useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => "http://host",
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		terminalAgents: {
			clearWorkspaceStatuses: {
				mutate: async (input: { workspaceId: string; terminalId: string }) => {
					expect(input).toEqual({
						workspaceId: "workspace",
						terminalId: "terminal",
					});
					workerStatus = "idle";
				},
			},
		},
	}),
}));
mock.module("renderer/lib/terminal/terminal-runtime-registry", () => ({
	terminalRuntimeRegistry: {
		getTerminal: () => ({
			onKey: (listener: (event: { domEvent: KeyboardEvent }) => void) => {
				listeners.add(listener);
				return { dispose: () => listeners.delete(listener) };
			},
		}),
	},
}));

const { act, cleanup, render } = await import("@testing-library/react");
const { useTerminalInterruptClear } = await import(
	"../useTerminalInterruptClear"
);

function Probe() {
	useTerminalInterruptClear({
		workspaceId: "workspace",
		terminalId: "terminal",
		terminalInstanceId: "pane",
		connectionState: "open",
	});
	return null;
}

afterEach(() => {
	cleanup();
	expect(listeners.size).toBe(0);
	workerStatus = "working";
	lifecycleOwner = undefined;
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test.each([
	"c",
	"Escape",
])("%s preserves external worker status and still interrupts an ordinary agent", async (key) => {
	const queryClient = new QueryClient();
	const tree = () => (
		<QueryClientProvider client={queryClient}>
			<Probe />
		</QueryClientProvider>
	);
	const view = render(tree());
	const pressKey = async () => {
		await act(async () => {
			for (const listener of listeners) {
				listener({
					domEvent: new KeyboardEvent("keydown", { key, ctrlKey: key === "c" }),
				});
			}
		});
	};

	await pressKey();
	expect(workerStatus).toBe("idle");
	workerStatus = "working";
	lifecycleOwner = "external";
	view.rerender(tree());
	await pressKey();
	expect(workerStatus).toBe("working");
	lifecycleOwner = "paradev";
	view.rerender(tree());
	await pressKey();
	expect(workerStatus).toBe("idle");
	queryClient.clear();
});
