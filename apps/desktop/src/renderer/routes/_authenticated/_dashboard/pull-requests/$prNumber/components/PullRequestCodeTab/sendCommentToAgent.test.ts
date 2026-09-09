import { expect, mock, test } from "bun:test";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";
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

function harness(outcomes: SubmitOutcome[]) {
	let linkedWorkspaceId: string | null = null;
	const submitWorkspaceCreate = mock(() => {
		const outcome = outcomes.shift();
		if (!outcome) throw new Error("unexpected create");
		return {
			workspaceId: "optimistic",
			completed: Promise.resolve(outcome),
		};
	});
	const runAgent = mock(
		async (_args: { workspaceId: string; agent: string; prompt: string }) =>
			undefined,
	);
	const deps: SendCommentToAgentDeps = {
		hostId: "host-1",
		projectId: "project-1",
		prNumber: 42,
		getLinkedWorkspaceId: () => linkedWorkspaceId,
		writeTerminalInput: mock(async () => undefined),
		runAgent,
		submitWorkspaceCreate,
		// The real caller also invalidates the linked-workspace query; the ref it
		// writes is what the next send reads, which is what this stands in for.
		onWorkspaceCreated: (workspaceId) => {
			linkedWorkspaceId = workspaceId;
		},
	};
	return { deps, submitWorkspaceCreate, runAgent };
}

test("a retry after a failed agent launch reuses the workspace instead of creating a second one", async () => {
	const { deps, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

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

test("a create that produced no workspace leaves the next send on the create path", async () => {
	const { deps, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, error: "Host service is not running" },
		{ ok: true, workspaceId: "ws-2" },
	]);

	await expect(sendCommentToAgent(deps, input)).rejects.toThrow(
		"Host service is not running",
	);
	await sendCommentToAgent(deps, input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});
