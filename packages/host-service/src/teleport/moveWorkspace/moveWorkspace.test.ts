import { describe, expect, test } from "bun:test";
import type { ApiClient } from "../../types";
import { beginWorkspaceMove, type WorkspaceMoveDeps } from "./moveWorkspace";

type Call = [string, unknown];

function fakes(options: { fetchFails?: boolean; createdAfterPolls?: number }) {
	const calls: Call[] = [];
	const record =
		<T>(name: string, answer: (input: never) => T) =>
		async (input: unknown) => {
			calls.push([name, input]);
			return answer(input as never);
		};
	let polls = 0;
	const api = {
		workspaceMove: {
			begin: { mutate: record("begin", () => ({ workspaceMoveId: "move-1" })) },
			heartbeat: { mutate: record("heartbeat", () => ({ alive: true })) },
			attach: {
				mutate: record("attach", () => ({
					moves: [{ moveId: "chat-move-1", chatSessionId: "chat-1" }],
					skipped: [{ chatSessionId: "chat-2" }],
				})),
			},
			abandon: { mutate: record("abandon", () => ({ ok: true })) },
		},
		cloudWorkspace: {
			create: {
				mutate: record("cloudCreate", () => ({
					id: "cloud-ws",
					skippedChats: [{ chatSessionId: "chat-2" }],
				})),
			},
		},
		chatMove: {
			claim: {
				mutate: record("claim", () => ({
					workspaceId: "new-ws",
					chatSessionId: "chat-1",
					session: { harnessSessionId: "harness-1" },
				})),
			},
			events: {
				query: record("events", () => ({ events: [], nextAfterSeq: null })),
			},
			complete: { mutate: record("complete", () => ({ ok: true })) },
			fail: { mutate: record("fail", () => ({ ok: true })) },
		},
	} as unknown as ApiClient;
	const host = {
		project: {
			list: {
				query: record("projectList", () => [
					{ id: "project-1", repoOwner: "Acme", repoName: "App" },
				]),
			},
		},
		teleport: {
			fetchBranch: {
				mutate: record("fetchBranch", () => {
					if (options.fetchFails) throw new Error("fetch failed");
					return { branch: "superset/teleport-1" };
				}),
			},
			importChat: { mutate: record("importChat", () => ({})) },
			continueChat: { mutate: record("continueChat", () => ({})) },
		},
		workspaces: {
			createEnqueued: {
				mutate: record("createEnqueued", () => ({ workspaceId: "new-ws" })),
			},
		},
		workspace: {
			get: {
				query: record("get", () => {
					polls += 1;
					if (polls <= (options.createdAfterPolls ?? 0)) {
						throw Object.assign(new Error("missing"), {
							data: { code: "NOT_FOUND" },
						});
					}
					return { id: "new-ws" };
				}),
			},
		},
		workspaceCleanup: {
			destroy: { mutate: record("destroy", () => ({})) },
		},
	};
	const released: string[][] = [];
	const deps: WorkspaceMoveDeps = {
		api,
		organizationId: "org-1",
		fromHostId: "this-host",
		prepare: async () => ({
			branch: "superset/teleport-1",
			repositoryFullName: "acme/app",
			chats: [{ chatSessionId: "chat-1" }, { chatSessionId: "chat-2" }],
		}),
		releaseChats: async (ids) => {
			released.push(ids);
		},
		destinationHost: async () =>
			host as unknown as Awaited<
				ReturnType<WorkspaceMoveDeps["destinationHost"]>
			>,
		heartbeatMs: 60_000,
		createPollMs: 1,
		newWorkspaceId: () => "new-ws",
	};
	const names = () => calls.map(([name]) => name);
	return { deps, calls, names, released };
}

describe("beginWorkspaceMove", () => {
	test("moves to a computer: makes the workspace there, attaches it, then carries each chat over", async () => {
		const { deps, calls, names, released } = fakes({ createdAfterPolls: 2 });
		const { workspaceMoveId, done } = await beginWorkspaceMove(deps, {
			workspaceId: "ws-1",
			name: "Feature",
			destination: { kind: "computer", hostId: "other-host" },
		});
		await done;

		expect(workspaceMoveId).toBe("move-1");
		expect(calls[0]).toEqual([
			"begin",
			{
				fromWorkspaceId: "ws-1",
				fromHostId: "this-host",
				toHostId: "other-host",
			},
		]);
		expect(names()).toEqual([
			"begin",
			"projectList",
			"fetchBranch",
			"createEnqueued",
			"get",
			"get",
			"get",
			"attach",
			"claim",
			"events",
			"importChat",
			"complete",
			"continueChat",
		]);
		expect(calls.find(([name]) => name === "createEnqueued")?.[1]).toEqual({
			id: "new-ws",
			projectId: "project-1",
			branch: "superset/teleport-1",
			skipBranchPrefix: true,
			name: "Feature",
		});
		expect(released).toEqual([["chat-2"]]);
	});

	test("moves to the cloud: the new cloud workspace takes the chats", async () => {
		const { deps, calls, names, released } = fakes({});
		const { done } = await beginWorkspaceMove(deps, {
			workspaceId: "ws-1",
			name: "Feature",
			destination: { kind: "cloud", environmentId: "env-1" },
		});
		await done;

		expect(names()).toEqual(["begin", "cloudCreate"]);
		expect(calls[1]?.[1]).toMatchObject({
			organizationId: "org-1",
			environmentId: "env-1",
			branch: "superset/teleport-1",
			move: { workspaceMoveId: "move-1", chatSessionIds: ["chat-1", "chat-2"] },
		});
		expect(released).toEqual([["chat-2"]]);
	});

	test("a failure before the destination exists abandons the move and releases every chat", async () => {
		const { deps, calls, names, released } = fakes({ fetchFails: true });
		const { done } = await beginWorkspaceMove(deps, {
			workspaceId: "ws-1",
			name: "Feature",
			destination: { kind: "computer", hostId: "other-host" },
		});

		await expect(done).rejects.toThrow("fetch failed");
		expect(names()).toEqual(["begin", "projectList", "fetchBranch", "abandon"]);
		expect(calls.at(-1)?.[1]).toEqual({
			workspaceMoveId: "move-1",
			error: "fetch failed",
		});
		expect(released).toEqual([["chat-1", "chat-2"]]);
	});
});
