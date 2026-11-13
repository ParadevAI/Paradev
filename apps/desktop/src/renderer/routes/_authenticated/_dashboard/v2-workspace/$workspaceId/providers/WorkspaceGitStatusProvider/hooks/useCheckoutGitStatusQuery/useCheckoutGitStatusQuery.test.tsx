import { afterAll, afterEach, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ContextType, ReactNode } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { nativeWebGlobals } from "~/test-setup";
import { useCheckoutGitStatusQuery } from "./useCheckoutGitStatusQuery";

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

/** A host that answers `git:watch` with one `git:changed` carrying `event`. */
function startHost(event: { repositoryId?: string }) {
	const commands: string[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			if (bunServer.upgrade(request)) return;
			return new Response(null, { status: 404 });
		},
		websocket: {
			message(socket, raw) {
				const command = JSON.parse(String(raw)) as { type: string };
				commands.push(command.type);
				if (command.type !== "git:watch") return;
				socket.send(
					JSON.stringify({
						type: "git:changed",
						workspaceId: WORKSPACE_ID,
						...event,
					}),
				);
			},
		},
	});
	stopHost = () => void server.stop(true);
	return { commands, url: `http://127.0.0.1:${server.port}` };
}

function renderStatuses(
	hostUrl: string,
	repositoryIds: (string | undefined)[],
) {
	const statusInputs: { repositoryId?: string }[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			if (call.op.path === "git.getStatus") {
				statusInputs.push(call.op.input as { repositoryId?: string });
			}
			observer.next({
				result: {
					data:
						call.op.path === "git.getBaseBranch" ? { baseBranch: null } : {},
				},
			});
			observer.complete();
		});
	const queryClient = new QueryClient();
	queryClient.setQueryData(["relay-endpoint"], { url: hostUrl });
	const wrapper = ({ children }: { children: ReactNode }) => (
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
							{children}
						</SandboxAccessContext.Provider>
					</HostWorkspacesContext.Provider>
				</LocalHostServiceContext.Provider>
			</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
	const view = renderHook(
		() =>
			repositoryIds.map((repositoryId) =>
				useCheckoutGitStatusQuery(WORKSPACE_ID, repositoryId),
			),
		{ wrapper },
	);
	const readsOf = (repositoryId: string | undefined) =>
		statusInputs.filter((input) => input.repositoryId === repositoryId).length;
	return { readsOf, statusInputs, view };
}

test("refetches the checkout's status on a git change for it, and stops watching on unmount", async () => {
	const host = startHost({ repositoryId: "repo-api" });
	const { readsOf, view } = renderStatuses(host.url, ["repo-api"]);

	await waitFor(() => expect(host.commands).toContain("git:watch"));
	await waitFor(() => expect(readsOf("repo-api")).toBeGreaterThanOrEqual(2));

	view.unmount();
	await waitFor(() => expect(host.commands).toContain("git:unwatch"));
});

test("ignores a git change for another checkout", async () => {
	const host = startHost({ repositoryId: "repo-api" });
	const { readsOf } = renderStatuses(host.url, ["repo-api", "repo-web"]);

	await waitFor(() => expect(readsOf("repo-api")).toBeGreaterThanOrEqual(2));
	expect(readsOf("repo-web")).toBe(1);
});

test("a workspace without checkouts reads status with no repository and refetches on a change", async () => {
	const host = startHost({});
	const { statusInputs } = renderStatuses(host.url, [undefined]);

	await waitFor(() => expect(statusInputs.length).toBeGreaterThanOrEqual(2));
	expect(statusInputs.every((input) => !("repositoryId" in input))).toBe(true);
});
