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
import { turnSteersQuery } from "@superset/agent-harness/session/definitions";
import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type { AgentActivities } from "../../activities/createActivities";

type Call = { name: string; input: Record<string, unknown> };

interface Script {
	settleSteerPendingTimes?: number;
	/** Hold each run until this resolves, then report the steers it read. */
	runGate?: () => Promise<void>;
	readSteersDuringRun?: boolean;
	runHangs?: boolean;
	/** Fail this many runs with a provider error before one succeeds. */
	modelErrors?: number;
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
	hooks: { runStarted?: () => void; runCancelled?: () => void } = {},
) {
	let settlePending = script.settleSteerPendingTimes ?? 0;
	let modelErrors = script.modelErrors ?? 0;
	const activities: AgentActivities = {
		async reconcileDevs() {
			return null;
		},
		async beginTurn(input) {
			calls.push({ name: "beginTurn", input: { ...input } });
		},
		async addSteers(input) {
			calls.push({ name: "addSteers", input: { ...input } });
		},
		async runTurn(input) {
			calls.push({ name: "runTurn", input: { ...input } });
			hooks.runStarted?.();
			if (modelErrors > 0) {
				modelErrors -= 1;
				throw ApplicationFailure.retryable("529 overloaded", "PdevModelError");
			}
			if (script.runHangs) {
				const context = Context.current();
				try {
					for (;;) {
						context.heartbeat();
						await context.sleep(100);
					}
				} finally {
					hooks.runCancelled?.();
				}
			}
			await script.runGate?.();
			if (!script.readSteersDuringRun)
				return { steersConsumed: input.steersFrom };
			const workflowId =
				Context.current().info.workflowExecution?.workflowId ?? "";
			const steers = await env.client.workflow
				.getHandle(workflowId)
				.query(turnSteersQuery, input.turnId);
			return { steersConsumed: steers.length };
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
	it("runs a turn with pdev, then settles; a resent prompt is a no-op", async () => {
		const calls: Call[] = [];
		await withWorker(fakeActivities({}, calls), "s1", async () => {
			const input = { turnId: "t1", promptId: "p1", text: "run the tests" };
			assert.equal(await startTurn(env.client, "s1", input), "accepted");
			await waitFor(() => names(calls).includes("settleTurn"));
			assert.equal(await startTurn(env.client, "s1", input), "duplicate");
		});
		assert.deepEqual(names(calls), ["beginTurn", "runTurn", "settleTurn"]);
		assert.deepEqual(calls[1]?.input.prompts, [
			{ promptId: "p1", text: "run the tests" },
		]);
		assert.equal(calls.at(-1)?.input.outcome, "completed");
	});

	it("retries a turn through provider errors until it completes", async () => {
		const calls: Call[] = [];
		await withWorker(
			fakeActivities({ modelErrors: 6 }, calls),
			"s-retry",
			async () => {
				await startTurn(env.client, "s-retry", {
					turnId: "t1",
					promptId: "p1",
					text: "hi",
				});
				await waitFor(() => names(calls).includes("runTurn"));
				await env.sleep("1 hour");
				await waitFor(() => names(calls).includes("settleTurn"));
			},
		);
		assert.equal(names(calls).filter((name) => name === "runTurn").length, 7);
		assert.equal(calls.at(-1)?.input.outcome, "completed");
	});
	it("hands a steer to the running turn", async () => {
		const calls: Call[] = [];
		let released = false;
		const activities = fakeActivities(
			{ runGate: () => waitFor(() => released), readSteersDuringRun: true },
			calls,
		);
		await withWorker(activities, "s2", async () => {
			await startTurn(env.client, "s2", {
				turnId: "t1",
				promptId: "p1",
				text: "first",
			});
			await waitFor(() => names(calls).includes("runTurn"));
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
		assert.deepEqual(names(calls), ["beginTurn", "runTurn", "settleTurn"]);
		assert.equal(calls.at(-1)?.input.steersConsumed, 1);
	});

	it("runs pdev again for a steer the run ended before reading", async () => {
		const calls: Call[] = [];
		let released = false;
		const activities = fakeActivities(
			{ runGate: () => waitFor(() => released) },
			calls,
		);
		await withWorker(activities, "s7", async () => {
			await startTurn(env.client, "s7", {
				turnId: "t1",
				promptId: "p1",
				text: "first",
			});
			await waitFor(() => names(calls).includes("runTurn"));
			await steerTurn(env.client, "s7", {
				turnId: "t1",
				promptId: "p2",
				text: "one more thing",
			});
			released = true;
			await waitFor(() => names(calls).includes("settleTurn"));
		});
		assert.deepEqual(names(calls), [
			"beginTurn",
			"runTurn",
			"runTurn",
			"settleTurn",
		]);
		assert.deepEqual(calls[2]?.input.prompts, [
			{ promptId: "p2", text: "one more thing", steer: true },
		]);
		assert.equal(calls[2]?.input.steersFrom, 1);
		assert.equal(calls.at(-1)?.input.steersConsumed, 1);
	});

	it("joins a steer to a queued turn, and drops one for a finished turn", async () => {
		const calls: Call[] = [];
		let released = false;
		let entered = false;
		const activities = fakeActivities(
			{
				runGate: async () => {
					entered = true;
					await waitFor(() => released);
				},
			},
			calls,
		);
		await withWorker(activities, "s6", async () => {
			await startTurn(env.client, "s6", {
				turnId: "t1",
				promptId: "p1",
				text: "first",
			});
			await waitFor(() => entered);
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
		const secondTurn = calls.slice(
			calls.findIndex((c) => c.input.turnId === "t2"),
		);
		assert.deepEqual(names(secondTurn), ["beginTurn", "runTurn", "settleTurn"]);
		assert.deepEqual(secondTurn[1]?.input.prompts, [
			{ promptId: "p2", text: "second" },
			{ promptId: "p3", text: "and this", steer: true },
		]);
		assert.equal(secondTurn.at(-1)?.input.steersConsumed, 1);
	});

	it("waits for a steer the API reports pending, then runs it", async () => {
		const calls: Call[] = [];
		const activities = fakeActivities({ settleSteerPendingTimes: 1 }, calls);
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
			"runTurn",
			"settleTurn",
			"runTurn",
			"settleTurn",
		]);
		assert.equal(calls.at(-1)?.input.steersConsumed, 1);
	});

	it("settles a stopped turn as interrupted", async () => {
		const calls: Call[] = [];
		let running = false;
		let cancelled = false;
		const activities = fakeActivities({ runHangs: true }, calls, {
			runStarted: () => {
				running = true;
			},
			runCancelled: () => {
				cancelled = true;
			},
		});
		await withWorker(activities, "s4", async () => {
			await startTurn(env.client, "s4", {
				turnId: "t1",
				promptId: "p1",
				text: "long job",
			});
			await waitFor(() => running);
			await interruptTurn(env.client, "s4", "t1");
			await waitFor(() => names(calls).includes("settleTurn") && cancelled);
			const state = await env.client.workflow
				.getHandle(sessionWorkflowId("s4"))
				.query(stateQuery);
			assert.equal(state.status, "idle");
		});
		assert.equal(calls.at(-1)?.input.outcome, "interrupted");
	});

	it("ends the workflow after ten idle minutes", async () => {
		const calls: Call[] = [];
		await withWorker(fakeActivities({}, calls), "s5", async () => {
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
		assert.deepEqual(names(calls), ["beginTurn", "runTurn", "settleTurn"]);
	});
});
