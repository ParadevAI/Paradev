import { afterAll, afterEach, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { getQueryKey } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { ContextType, ReactNode } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { nativeWebGlobals } from "~/test-setup";
import type { CheckoutGitStatus } from "./types";
import {
	useCheckoutGitStatus,
	useCheckoutGitStatuses,
	WorkspaceGitStatusProvider,
} from "./WorkspaceGitStatusProvider";

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
const MACHINE_ID = "this-machine";

let stopHost: (() => void) | undefined;

afterEach(() => {
	cleanup();
	stopHost?.();
	stopHost = undefined;
});

function startHost() {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			if (bunServer.upgrade(request)) return;
			return new Response(null, { status: 404 });
		},
		websocket: { message() {} },
	});
	stopHost = () => void server.stop(true);
	return `http://127.0.0.1:${server.port}`;
}

type Status = NonNullable<CheckoutGitStatus["data"]>;

function cachedStatus(name: string): Status {
	return { currentBranch: { name } } as unknown as Status;
}

/** A query client warm from an earlier visit; the host never answers. */
function warmWrapper(repositoryIds: string[]) {
	const hostUrl = startHost();
	const link: TRPCLink<AppRouter> = () => () => observable(() => {});
	const queryClient = new QueryClient();
	queryClient.setQueryData(["relay-endpoint"], { url: hostUrl });
	queryClient.setQueryData(
		getQueryKey(workspaceTrpc.workspace.get, { id: WORKSPACE_ID }, "query"),
		{
			checkouts: repositoryIds.map((repositoryId, index) => ({
				repositoryId,
				isPrimary: index === 0,
			})),
		},
	);
	for (const repositoryId of repositoryIds) {
		const scope = { workspaceId: WORKSPACE_ID, repositoryId };
		queryClient.setQueryData(
			getQueryKey(workspaceTrpc.git.getBaseBranch, scope, "query"),
			{ baseBranch: "main" },
		);
		queryClient.setQueryData(
			getQueryKey(
				workspaceTrpc.git.getStatus,
				{ ...scope, baseBranch: "main", priority: "foreground" },
				"query",
			),
			cachedStatus(repositoryId),
		);
	}
	return ({ children }: { children: ReactNode }) => (
		<workspaceTrpc.Provider
			client={workspaceTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
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
								workspaces: [
									{
										id: WORKSPACE_ID,
										hostId: MACHINE_ID,
										organizationId: "org-1",
									},
								],
								isReady: true,
							} as NonNullable<ContextType<typeof HostWorkspacesContext>>
						}
					>
						<SandboxAccessContext.Provider
							value={{
								targets: [],
								isReady: true,
								agentCredentialsChangedWorkspaceId: null,
								usageRefusal: null,
							}}
						>
							<WorkspaceGitStatusProvider workspaceId={WORKSPACE_ID}>
								{children}
							</WorkspaceGitStatusProvider>
						</SandboxAccessContext.Provider>
					</HostWorkspacesContext.Provider>
				</LocalHostServiceContext.Provider>
			</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
}

test("a warm cache shows a single checkout's status on the first render", () => {
	const renders: CheckoutGitStatus[] = [];
	renderHook(
		() => {
			const status = useCheckoutGitStatus("repo-api");
			renders.push(status);
			return status;
		},
		{ wrapper: warmWrapper(["repo-api"]) },
	);

	expect(renders[0]?.isLoading).toBe(false);
	expect(renders[0]?.data).toEqual(cachedStatus("repo-api"));
});

test("a warm cache shows every checkout's status on the first render", () => {
	const renders: CheckoutGitStatus[][] = [];
	renderHook(
		() => {
			const statuses = useCheckoutGitStatuses(["repo-api", "repo-web"]);
			renders.push(statuses);
			return statuses;
		},
		{ wrapper: warmWrapper(["repo-api", "repo-web"]) },
	);

	expect(renders[0]?.map((status) => status.data)).toEqual([
		cachedStatus("repo-api"),
		cachedStatus("repo-web"),
	]);
});
