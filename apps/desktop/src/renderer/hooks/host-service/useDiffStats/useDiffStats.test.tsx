import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ContextType, ReactNode } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import superjson from "superjson";
import { nativeWebGlobals } from "~/test-setup";
import { useDiffStats } from "./useDiffStats";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const domEvents = {
	Event: globalThis.Event,
	MessageEvent: globalThis.MessageEvent,
};
Object.assign(globalThis, {
	Event: nativeWebGlobals.Event,
	MessageEvent: nativeWebGlobals.MessageEvent,
});
afterAll(() => {
	Object.assign(globalThis, domEvents);
});

const WORKSPACE_ID = "workspace-1";
const LIVE_WORKSPACE_ID = "workspace-2";
const MACHINE_ID = "this-machine";

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

function startHost() {
	const commands: { type: string; workspaceId?: string }[] = [];
	let statusReads = 0;
	const t = initTRPC.create({ transformer: superjson });
	const router = t.router({
		git: t.router({
			getStatus: t.procedure
				.input((input) => input)
				.query(() => {
					statusReads += 1;
					return { againstBase: [], staged: [], unstaged: [] };
				}),
		}),
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			if (bunServer.upgrade(request)) return;
			return fetchRequestHandler({
				endpoint: "/trpc",
				req: request,
				router,
				allowMethodOverride: true,
			});
		},
		websocket: {
			message(_socket, raw) {
				commands.push(JSON.parse(String(raw)));
			},
		},
	});
	stopHost = () => void server.stop(true);
	const watched = () =>
		commands
			.filter((command) => command.type === "git:watch")
			.map((command) => command.workspaceId);
	return {
		watched,
		statusReads: () => statusReads,
		url: `http://127.0.0.1:${server.port}`,
	};
}

function createWrapper(hostUrl: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(["relay-endpoint"], { url: hostUrl });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<LocalHostServiceContext.Provider
				value={
					{
						machineId: MACHINE_ID,
						activeHostUrl: hostUrl,
					} as NonNullable<ContextType<typeof LocalHostServiceContext>>
				}
			>
				<HostWorkspacesContext.Provider
					value={
						{
							workspaces: [WORKSPACE_ID, LIVE_WORKSPACE_ID].map((id) => ({
								id,
								hostId: MACHINE_ID,
								organizationId: "org-1",
							})),
							isReady: true,
						} as NonNullable<ContextType<typeof HostWorkspacesContext>>
					}
				>
					<SandboxAccessContext.Provider
						value={{
							targets: [],
							isReady: true,
							agentsToRestart: null,
							usageRefusal: null,
							wakeOpenWorkspace: async () => {},
						}}
					>
						{children}
					</SandboxAccessContext.Provider>
				</HostWorkspacesContext.Provider>
			</LocalHostServiceContext.Provider>
		</QueryClientProvider>
	);
	return wrapper;
}

describe("useDiffStats", () => {
	test("subscribes to git:changed by default so the stats stay live", async () => {
		const host = startHost();
		renderHook(() => useDiffStats(WORKSPACE_ID), {
			wrapper: createWrapper(host.url),
		});

		await waitFor(() => expect(host.watched()).toContain(WORKSPACE_ID));
	});

	test("a one-shot read fetches the stats without a git watch", async () => {
		const host = startHost();
		const wrapper = createWrapper(host.url);
		renderHook(() => useDiffStats(WORKSPACE_ID, { live: false }), {
			wrapper,
		});
		await waitFor(() => expect(host.statusReads()).toBe(1));

		renderHook(() => useDiffStats(LIVE_WORKSPACE_ID), { wrapper });
		await waitFor(() => expect(host.watched()).toContain(LIVE_WORKSPACE_ID));
		expect(host.watched()).not.toContain(WORKSPACE_ID);
	});

	test("a one-shot read reads again each time it mounts", async () => {
		const host = startHost();
		const wrapper = createWrapper(host.url);
		const first = renderHook(
			() => useDiffStats(WORKSPACE_ID, { live: false }),
			{ wrapper },
		);
		await waitFor(() => expect(host.statusReads()).toBe(1));
		first.unmount();

		renderHook(() => useDiffStats(WORKSPACE_ID, { live: false }), {
			wrapper,
		});
		await waitFor(() => expect(host.statusReads()).toBe(2));
	});
});
