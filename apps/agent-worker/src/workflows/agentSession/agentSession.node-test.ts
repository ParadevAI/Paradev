import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	interruptTurn,
	sessionWorkflowId,
	startTurn,
	stateQuery,
	steerTurn,
} from "@superset/agent-harness/session";
import { Context } from "@temporalio/activity";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { AgentActivities } from "../../activities/createActivities";

type Call = { name: string; input: Record<string, unknown> };

interface Script {
	toolCallsPerStep: Array<Array<{ id: string; name: string }>>;
	settleSteerPendingTimes?: number;
	toolStepHangs?: boolean;
}

let env: TestWorkflowEnvironment;

before(async () => {
	env = await TestWorkflowEnvironment.createTimeSkipping();
});

after(async () => {
	await env?.teardown();
});

function fakeActivities(
	script: Script,
	calls: Call[],
	hooks: { toolStarted?: () => void; toolCancelled?: () => void } = {},
) {
	let settlePending = script.settleSteerPendingTimes ?? 0;
	const activities: AgentActivities = {
		async beginTurn(input) {
			calls.push({ name: "beginTurn", input: { ...input } });
		},
		async addSteers(input) {
			calls.push({ name: "addSteers", input: { ...input } });
		},
		async modelStep(input) {
			calls.push({ name: "modelStep", input: { ...input } });
			return { toolCalls: script.toolCallsPerStep[input.step] ?? [] };
		},
		async toolStep(input) {
			calls.push({ name: "toolStep", input: { ...input } });
			hooks.toolStarted?.();
			if (script.toolStepHangs) {
				const context = Context.current();
				try {
					for (;;) {
						context.heartbeat();
						await context.sleep(100);
					}
				} finally {
					hooks.toolCancelled?.();
				}
			}
			return { isError: false };
		},
		async settleTurn(input) {
			calls.push({ name: "settleTurn", input: { ...input } });
			if (settlePending > 0) {
				settlePending -= 1;
				return { steerPending: true };
			}
			return { steerPending: false };
		},
	};
	return activities;
}

async function withWorker<T>(
	activities: AgentActivities,
	sessionId: string,
	fn: () => Promise<T>,
): Promise<T> {
	const worker = await Worker.create({
		connection: env.nativeConnection,
		taskQueue: "agent",
		defaultHeartbeatThrottleInterval: 50,
		maxHeartbeatThrottleInterval: 50,
		workflowsPath: fileURLToPath(new URL("../index.ts", import.meta.url)),
		activities,
	});
	return worker.runUntil(async () => {
		try {
			return await fn();
		} finally {
			await env.client.workflow
				.getHandle(sessionWorkflowId(sessionId))
				.terminate()
				.catch(() => {});
		}
	});
}

async function waitFor(check: () => boolean) {
	for (let i = 0; i < 200; i++) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("condition not met");
}

const names = (calls: Call[]) => calls.map((call) => call.name);

describe("agentSession workflow", () => {
	it("runs a turn through model and tool steps, then settles; a resent prompt is a no-op", async () => {
		const calls: Call[] = [];
		const activities = fakeActivities(
			{ toolCallsPerStep: [[{ id: "c1", name: "bash" }], []] },
			calls,
		);
		await withWorker(activities, "s1", async () => {
			const input = { turnId: "t1", promptId: "p1", text: "run the tests" };
			assert.equal(await startTurn(env.client, "s1", input), "accepted");
			await waitFor(() => names(calls).includes("settleTurn"));
			assert.equal(await startTurn(env.client, "s1", input), "duplicate");
		});
		assert.deepEqual(names(calls), [
			"beginTurn",
			"modelStep",
			"toolStep",
			"modelStep",
			"settleTurn",
		]);
		assert.equal(calls.at(-1)?.input.outcome, "completed");
	});

	it("joins a steer to the running turn before its next model call", async () => {
		const calls: Call[] = [];
		let released = false;
		const activities = fakeActivities(
			{ toolCallsPerStep: [[{ id: "c1", name: "bash" }], [], []] },
			calls,
		);
		const slowTool = activities.toolStep;
		activities.toolStep = async (input) => {
			await waitFor(() => released);
			return slowTool(input);
		};
		await withWorker(activities, "s2", async () => {
			await startTurn(env.client, "s2", {
				turnId: "t1",
				promptId: "p1",
				text: "first",
			});
			await waitFor(() => names(calls).includes("modelStep"));
			assert.equal(
				await steerTurn(env.client, "s2", {
					turnId: "t1",
					promptId: "p2",
					text: "also this",
				}),
				"steered",
			);
			released = true;
			await waitFor(() => names(calls).includes("settleTurn"));
		});
		assert.deepEqual(names(calls), [
			"beginTurn",
			"modelStep",
			"toolStep",
			"addSteers",
			"modelStep",
			"settleTurn",
		]);
	});

	it("joins a steer to a queued turn, and drops one for a finished turn", async () => {
		const calls: Call[] = [];
		let released = false;
		let toolEntered = false;
		const activities = fakeActivities(
			{ toolCallsPerStep: [[{ id: "c1", name: "bash" }], []] },
			calls,
		);
		const slowTool = activities.toolStep;
		activities.toolStep = async (input) => {
			toolEntered = true;
			await waitFor(() => released);
			return slowTool(input);
		};
		const turnIds = () =>
			calls.filter((c) => c.name === "beginTurn").map((c) => c.input.turnId);
		await withWorker(activities, "s6", async () => {
			await startTurn(env.client, "s6", {
				turnId: "t1",
				promptId: "p1",
				text: "first",
			});
			await waitFor(() => toolEntered);
			await startTurn(env.client, "s6", {
				turnId: "t2",
				promptId: "p2",
				text: "second",
			});
			const steer = { turnId: "t2", promptId: "p3", text: "and this" };
			assert.equal(await steerTurn(env.client, "s6", steer), "steered");
			released = true;
			await waitFor(
				() => names(calls).filter((n) => n === "settleTurn").length === 2,
			);
			assert.equal(
				await steerTurn(env.client, "s6", {
					turnId: "t1",
					promptId: "p4",
					text: "late",
				}),
				"duplicate",
			);
		});
		assert.deepEqual(turnIds(), ["t1", "t2"]);
		const secondTurn = calls.slice(
			calls.findIndex((c) => c.input.turnId === "t2"),
		);
		assert.deepEqual(names(secondTurn), [
			"beginTurn",
			"addSteers",
			"modelStep",
			"toolStep",
			"modelStep",
			"settleTurn",
		]);
		assert.equal(secondTurn.at(-1)?.input.steersConsumed, 1);
	});

	it("waits for a steer the API reports pending, then settles with it read", async () => {
		const calls: Call[] = [];
		const activities = fakeActivities(
			{ toolCallsPerStep: [[], []], settleSteerPendingTimes: 1 },
			calls,
		);
		await withWorker(activities, "s3", async () => {
			await startTurn(env.client, "s3", {
				turnId: "t1",
				promptId: "p1",
				text: "hi",
			});
			await waitFor(() => names(calls).includes("settleTurn"));
			await steerTurn(env.client, "s3", {
				turnId: "t1",
				promptId: "p2",
				text: "late",
			});
			await waitFor(
				() => names(calls).filter((n) => n === "settleTurn").length === 2,
			);
		});
		assert.deepEqual(names(calls), [
			"beginTurn",
			"modelStep",
			"settleTurn",
			"addSteers",
			"modelStep",
			"settleTurn",
		]);
		assert.equal(calls.at(-1)?.input.steersConsumed, 1);
	});

	it("settles a stopped turn as interrupted", async () => {
		const calls: Call[] = [];
		let toolRunning = false;
		let toolCancelled = false;
		const activities = fakeActivities(
			{ toolCallsPerStep: [[{ id: "c1", name: "bash" }]], toolStepHangs: true },
			calls,
			{
				toolStarted: () => {
					toolRunning = true;
				},
				toolCancelled: () => {
					toolCancelled = true;
				},
			},
		);
		await withWorker(activities, "s4", async () => {
			await startTurn(env.client, "s4", {
				turnId: "t1",
				promptId: "p1",
				text: "long job",
			});
			await waitFor(() => toolRunning);
			await interruptTurn(env.client, "s4", "t1");
			await waitFor(() => names(calls).includes("settleTurn") && toolCancelled);
			const state = await env.client.workflow
				.getHandle(sessionWorkflowId("s4"))
				.query(stateQuery);
			assert.equal(state.status, "idle");
		});
		assert.equal(calls.at(-1)?.input.outcome, "interrupted");
	});

	it("ends the workflow after ten idle minutes", async () => {
		const calls: Call[] = [];
		const activities = fakeActivities({ toolCallsPerStep: [[]] }, calls);
		await withWorker(activities, "s5", async () => {
			await startTurn(env.client, "s5", {
				turnId: "t1",
				promptId: "p1",
				text: "hi",
			});
			await waitFor(() => names(calls).includes("settleTurn"));
			await env.sleep("11 minutes");
			const handle = env.client.workflow.getHandle(sessionWorkflowId("s5"));
			const description = await handle.describe();
			assert.equal(description.status.name, "COMPLETED");
		});
		assert.deepEqual(names(calls), ["beginTurn", "modelStep", "settleTurn"]);
	});
});
