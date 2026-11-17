import { describe, expect, test } from "bun:test";
import type { HostDb } from "../db";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
import {
	createTestDb,
	seedLinkedPullRequest,
} from "../trpc/router/pull-requests/shared/test-db";
import { isAgentBusyForAutoFix } from "./agent-activity.ts";
import { NO_PUSH_GRACE_MS } from "./decision.ts";
import { ACTIVE_POLL_MS, PrAutoFixManager } from "./pr-auto-fix-manager.ts";
import {
	PrAutoFixStore,
	readLiveWorkspace,
	readWorkspacePullRequest,
} from "./store.ts";
import type { PrAutoFixPullRequest } from "./types.ts";

const WORKSPACE_ID = "ws-newer";
const PR_URL = "https://github.com/octocat/hello/pull/42";
const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);

function setup(db: HostDb = createTestDb()) {
	let now = 1_800_000_000_000;
	const clock = { advance: (ms: number) => (now += ms), now: () => now };
	const agent: TerminalAgentBinding = {
		terminalId: "term-1",
		workspaceId: WORKSPACE_ID,
		agentId: "claude",
		startedAt: now,
		lastEventAt: now,
		lastEventType: "Stop",
	};
	const observed: PrAutoFixPullRequest = {
		state: "open",
		headSha: HEAD_A,
		headBranch: "feature/42",
		checks: [{ status: "pending" }],
	};
	const reads: { fresh: boolean }[] = [];
	const prompts: string[] = [];
	const manager = new PrAutoFixManager({
		store: new PrAutoFixStore(db, clock.now),
		getWorkspace: (id) => readLiveWorkspace(db, id),
		getWorkspacePullRequest: (id) => readWorkspacePullRequest(db, id),
		readPullRequest: async ({ fresh }) => {
			reads.push({ fresh });
			return { ...observed, checks: [...observed.checks] };
		},
		readCheckout: async () => ({
			branch: "feature/42",
			clean: true,
			headSha: observed.headSha,
		}),
		listAgents: () => [
			{
				terminalId: agent.terminalId,
				binding: agent,
				lastEventAt: agent.lastEventAt,
				busy: isAgentBusyForAutoFix(agent),
				planMode: false,
			},
		],
		sendToAgent: async ({ text, acquireDelivery }) => {
			const permit = await acquireDelivery();
			if (!permit?.isValid()) throw new Error("declined");
			prompts.push(text);
			agent.lastEventType = "Start";
			agent.lastEventAt = now;
			return undefined;
		},
		notifyChanged: () => {},
		now: clock.now,
		setIntervalFn: (() => ({ unref() {} })) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as typeof clearInterval,
	});
	const watch = () => manager.describe(WORKSPACE_ID, 42).watch;
	const finishTurn = () => {
		agent.lastEventType = "Stop";
		agent.lastEventAt = now;
	};
	return { db, clock, observed, reads, prompts, manager, watch, finishTurn };
}

function seeded() {
	const db = createTestDb();
	seedLinkedPullRequest(db);
	return db;
}

describe("PrAutoFixManager", () => {
	test("sends one fix per red head, pauses when no push follows, and resets on green", async () => {
		const { clock, observed, reads, prompts, manager, watch, finishTurn } =
			setup(seeded());
		manager.set({ workspaceId: WORKSPACE_ID, prNumber: 42, enabled: true });
		expect(watch()).toMatchObject({
			pullRequestUrl: PR_URL,
			status: "watching",
			attempts: 0,
			maxAttempts: 3,
		});

		await manager.tick();
		expect(prompts).toHaveLength(0);
		await manager.tick();
		expect(reads).toHaveLength(1);

		observed.checks = [{ status: "success" }, { status: "failure" }];
		clock.advance(ACTIVE_POLL_MS);
		await manager.tick();
		expect(prompts).toHaveLength(1);
		expect(prompts[0]).toStartWith(
			"Auto-fix CI: CI failed on PR #42 at aaaaaaa.",
		);
		expect(watch()).toMatchObject({ status: "fixing", attempts: 1 });

		clock.advance(ACTIVE_POLL_MS);
		await manager.tick();
		expect(reads).toHaveLength(2);

		finishTurn();
		clock.advance(ACTIVE_POLL_MS);
		await manager.tick();
		expect(reads.at(-1)).toEqual({ fresh: true });
		expect(watch()?.status).toBe("fixing");

		clock.advance(NO_PUSH_GRACE_MS);
		await manager.tick();
		expect(watch()).toMatchObject({ status: "paused", pauseReason: "no-push" });
		expect(prompts).toHaveLength(1);

		manager.set({ workspaceId: WORKSPACE_ID, prNumber: 42, enabled: true });
		await manager.tick();
		expect(prompts).toHaveLength(2);
		expect(watch()).toMatchObject({ status: "fixing", attempts: 1 });

		finishTurn();
		observed.headSha = HEAD_B;
		observed.checks = [{ status: "pending" }];
		clock.advance(ACTIVE_POLL_MS);
		await manager.tick();
		expect(watch()).toMatchObject({ status: "watching", attempts: 1 });

		observed.checks = [{ status: "success" }];
		clock.advance(ACTIVE_POLL_MS);
		await manager.tick();
		expect(watch()).toMatchObject({ status: "watching", attempts: 0 });
		expect(prompts).toHaveLength(2);

		manager.set({ workspaceId: WORKSPACE_ID, prNumber: 42, enabled: false });
		expect(watch()).toBeNull();
	});

	test("pauses a fix that was recorded but never confirmed sent when the host restarts", () => {
		const db = seeded();
		const store = new PrAutoFixStore(db);
		const watching = store.watch({
			workspaceId: WORKSPACE_ID,
			pullRequestUrl: PR_URL,
			prNumber: 42,
		});
		store.update(watching, {
			status: "fixing",
			attempts: 1,
			lastHandledHeadSha: HEAD_A,
		});

		const { manager, watch } = setup(db);
		manager.start();
		expect(watch()).toMatchObject({
			status: "paused",
			pauseReason: "dispatch-interrupted",
			attempts: 1,
		});
		manager.stop();
	});
});
