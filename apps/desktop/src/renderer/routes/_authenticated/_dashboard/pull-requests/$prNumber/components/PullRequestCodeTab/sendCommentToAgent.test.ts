import { expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";
import {
	type LinkedWorkspace,
	resolveLinkedWorkspaceId,
} from "./resolveLinkedWorkspaceId";
import {
	type SendCommentToAgentDeps,
	type SendCommentToAgentInput,
	sendCommentToAgent,
} from "./sendCommentToAgent";

const input: SendCommentToAgentInput = {
	comment: "please fix this",
	target: { kind: "new", configId: "claude", placement: "split-pane" },
	path: "src/index.ts",
	startLine: 3,
	endLine: 5,
	side: "additions",
};

const LINKED_WORKSPACE_KEY = ["pull-request-linked-workspace", "project-1", 42];

/**
 * Wires the deps the way PullRequestCodeTab does — the query cache carries the
 * workspace a failed launch left behind, and the live-workspace mirror decides
 * whether that id is still usable. `mount()` rebuilds only what the component
 * rebuilds, so a test can leave the Code tab and come back.
 */
function harness(outcomes: SubmitOutcome[]) {
	const queryClient = new QueryClient();
	const liveWorkspaceIds = new Set<string>();
	const submitWorkspaceCreate = mock(() => {
		const outcome = outcomes.shift();
		if (!outcome) throw new Error("unexpected create");
		if (outcome.workspaceId !== undefined) {
			liveWorkspaceIds.add(outcome.workspaceId);
		}
		return {
			workspaceId: "optimistic",
			completed: Promise.resolve(outcome),
		};
	});
	const runAgent = mock(
		async (_args: { workspaceId: string; agent: string; prompt: string }) =>
			undefined,
	);
	const mount = (): SendCommentToAgentDeps => ({
		hostId: "host-1",
		projectId: "project-1",
		prNumber: 42,
		getLinkedWorkspaceId: () =>
			resolveLinkedWorkspaceId({
				workspaceId:
					queryClient.getQueryData<LinkedWorkspace>(LINKED_WORKSPACE_KEY)
						?.workspaceId,
				liveWorkspaceIds,
			}),
		writeTerminalInput: mock(async () => undefined),
		runAgent,
		submitWorkspaceCreate,
		onWorkspaceCreated: (workspaceId) => {
			queryClient.setQueryData(LINKED_WORKSPACE_KEY, { workspaceId });
		},
	});
	return { mount, submitWorkspaceCreate, runAgent, liveWorkspaceIds };
}

test("a retry after a failed agent launch reuses the workspace instead of creating a second one", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);
	const deps = mount();

	await expect(sendCommentToAgent(deps, input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	await sendCommentToAgent(deps, input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		agent: "claude",
	});
});

test("the workspace survives leaving the Code tab and coming back", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// Everything the component holds is gone; only the query cache is left.
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" });
});

test("a workspace archived after the failed launch is not sent into", async () => {
	const { mount, submitWorkspaceCreate, runAgent, liveWorkspaceIds } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
		{ ok: true, workspaceId: "ws-2" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// Deleting a workspace archives it; the live mirror drops the row while the
	// seeded id and the host's own row both survive.
	liveWorkspaceIds.delete("ws-1");
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});

test("a create that produced no workspace leaves the next send on the create path", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, error: "Host service is not running" },
		{ ok: true, workspaceId: "ws-2" },
	]);
	const deps = mount();

	await expect(sendCommentToAgent(deps, input)).rejects.toThrow(
		"Host service is not running",
	);
	await sendCommentToAgent(deps, input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});
