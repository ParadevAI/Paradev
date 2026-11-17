import { describe, expect, test } from "bun:test";
import {
	decideAutoFix,
	NO_PUSH_GRACE_MS,
	type PrAutoFixDecisionInput,
	UNSTARTED_FIX_MS,
} from "./decision.ts";
import type { PrAutoFixPullRequest, PrAutoFixState } from "./types.ts";

const NOW = 1_800_000_000_000;
const RED: PrAutoFixPullRequest["checks"] = [
	{ status: "success" },
	{ status: "failure" },
];
const GREEN: PrAutoFixPullRequest["checks"] = [
	{ status: "success" },
	{ status: "skipped" },
];
const RUNNING: PrAutoFixPullRequest["checks"] = [
	{ status: "success" },
	{ status: "pending" },
];

function state(patch: Partial<PrAutoFixState> = {}): PrAutoFixState {
	return {
		workspaceId: "ws-1",
		pullRequestUrl: "https://github.com/octocat/hello/pull/42",
		prNumber: 42,
		status: "watching",
		pauseReason: null,
		attempts: 0,
		lastHandledHeadSha: null,
		agentTerminalId: null,
		fixSentAt: null,
		updatedAt: NOW - 10_000,
		...patch,
	};
}

function decide(patch: Partial<PrAutoFixDecisionInput> = {}) {
	return decideAutoFix({
		state: state(),
		workspaceAvailable: true,
		agent: { busy: false, lastEventAt: NOW - 5_000, planMode: false },
		checkout: { branch: "feature/42", clean: true },
		pullRequest: {
			state: "open",
			headSha: "a".repeat(40),
			headBranch: "feature/42",
			checks: RED,
		},
		now: NOW,
		...patch,
	});
}

const pr = (patch: Partial<PrAutoFixPullRequest>): PrAutoFixPullRequest => ({
	state: "open",
	headSha: "a".repeat(40),
	headBranch: "feature/42",
	checks: RED,
	...patch,
});

/** A fix sent for head `a…` that the agent finished `finishedAgo` ms ago. */
function afterFix(finishedAgo: number, checks = RED) {
	const sentAt = NOW - finishedAgo - 30_000;
	return decide({
		state: state({
			status: "fixing",
			attempts: 1,
			lastHandledHeadSha: "a".repeat(40),
			agentTerminalId: "term-1",
			fixSentAt: sentAt,
		}),
		agent: { busy: false, lastEventAt: NOW - finishedAgo, planMode: false },
		pullRequest: pr({ checks }),
	});
}

describe("decideAutoFix", () => {
	test("sends the first fix when checks settle red on a new commit", () => {
		expect(decide()).toEqual({
			type: "fix",
			headSha: "a".repeat(40),
			attempt: 1,
			switchBranch: null,
		});
	});

	test("counts a cancelled check as a failure", () => {
		expect(
			decide({ pullRequest: pr({ checks: [{ status: "cancelled" }] }) }).type,
		).toBe("fix");
	});

	test("turns itself off when the workspace is gone or the PR is closed or merged", () => {
		expect(decide({ workspaceAvailable: false })).toEqual({
			type: "disable",
			reason: "workspace-unavailable",
		});
		for (const closed of ["closed", "merged"] as const) {
			expect(decide({ pullRequest: pr({ state: closed }) })).toEqual({
				type: "disable",
				reason: "pull-request-closed",
			});
		}
	});

	test("waits while paused, while the agent is busy, and while the head is unknown", () => {
		expect(
			decide({ state: state({ status: "paused", pauseReason: "no-push" }) }),
		).toEqual({ type: "wait" });
		expect(
			decide({
				agent: { busy: true, lastEventAt: NOW, planMode: false },
			}),
		).toEqual({ type: "wait" });
		expect(decide({ pullRequest: pr({ headSha: null }) })).toEqual({
			type: "wait",
		});
	});

	test("waits while checks run or none were reported", () => {
		expect(decide({ pullRequest: pr({ checks: RUNNING }) })).toEqual({
			type: "wait",
		});
		expect(decide({ pullRequest: pr({ checks: [] }) })).toEqual({
			type: "wait",
		});
	});

	test("never fixes the same commit twice", () => {
		expect(
			decide({
				state: state({ attempts: 1, lastHandledHeadSha: "a".repeat(40) }),
			}),
		).toEqual({ type: "wait" });
	});

	test("resets the attempts on green, including a green rerun without a push", () => {
		expect(
			decide({
				state: state({ attempts: 2, lastHandledHeadSha: "b".repeat(40) }),
				pullRequest: pr({ checks: GREEN }),
			}),
		).toEqual({ type: "update", attempts: 0 });
		expect(afterFix(5_000, GREEN)).toEqual({ type: "update", attempts: 0 });
		expect(decide({ pullRequest: pr({ checks: GREEN }) })).toEqual({
			type: "wait",
		});
	});

	test("goes back to watching, keeping the count, once a pushed fix is in CI", () => {
		expect(
			decide({
				state: state({
					status: "fixing",
					attempts: 1,
					lastHandledHeadSha: "b".repeat(40),
					fixSentAt: NOW - 60_000,
				}),
				pullRequest: pr({ checks: RUNNING }),
			}),
		).toEqual({ type: "update", attempts: 1 });
	});

	test("starts the next attempt when the pushed fix fails again", () => {
		expect(
			decide({
				state: state({ attempts: 1, lastHandledHeadSha: "b".repeat(40) }),
			}),
		).toEqual({
			type: "fix",
			headSha: "a".repeat(40),
			attempt: 2,
			switchBranch: null,
		});
	});

	test("pauses with no-push when a finished fix turn left the head where it was", () => {
		expect(afterFix(NO_PUSH_GRACE_MS - 1_000)).toEqual({ type: "wait" });
		expect(afterFix(NO_PUSH_GRACE_MS + 1_000)).toEqual({
			type: "pause",
			reason: "no-push",
		});
	});

	test("lets a rerun on the same commit finish before calling it no-push", () => {
		expect(afterFix(NO_PUSH_GRACE_MS + 1_000, RUNNING)).toEqual({
			type: "wait",
		});
	});

	test("waits for the send to be confirmed before judging a fix", () => {
		expect(
			decide({
				state: state({
					status: "fixing",
					attempts: 1,
					lastHandledHeadSha: "a".repeat(40),
					fixSentAt: null,
				}),
			}),
		).toEqual({ type: "wait" });
	});

	test("pauses with no-push once the agent that got the fix is gone", () => {
		const fixing = state({
			status: "fixing",
			attempts: 1,
			lastHandledHeadSha: "a".repeat(40),
			agentTerminalId: "term-1",
		});
		expect(
			decide({
				state: { ...fixing, fixSentAt: NOW - 10_000 },
				agent: null,
			}),
		).toEqual({ type: "wait" });
		expect(
			decide({
				state: { ...fixing, fixSentAt: NOW - NO_PUSH_GRACE_MS - 1_000 },
				agent: null,
			}),
		).toEqual({ type: "pause", reason: "no-push" });
	});

	test("pauses with dispatch-interrupted when the agent never picked the fix up", () => {
		const sentAt = NOW - UNSTARTED_FIX_MS - 1_000;
		expect(
			decide({
				state: state({
					status: "fixing",
					attempts: 1,
					lastHandledHeadSha: "a".repeat(40),
					agentTerminalId: "term-1",
					fixSentAt: sentAt,
				}),
				agent: { busy: false, lastEventAt: sentAt - 1, planMode: false },
			}),
		).toEqual({ type: "pause", reason: "dispatch-interrupted" });
	});

	test("pauses at the attempt limit instead of sending another fix", () => {
		expect(
			decide({
				state: state({ attempts: 3, lastHandledHeadSha: "b".repeat(40) }),
			}),
		).toEqual({ type: "pause", reason: "attempt-limit" });
		expect(
			decide({
				state: state({ attempts: 1, lastHandledHeadSha: "b".repeat(40) }),
				maxAttempts: 1,
			}),
		).toEqual({ type: "pause", reason: "attempt-limit" });
	});

	test("waits without an agent, in plan mode, or without a checkout or PR branch", () => {
		expect(decide({ agent: null })).toEqual({ type: "wait" });
		expect(
			decide({
				agent: { busy: false, lastEventAt: NOW, planMode: true },
			}),
		).toEqual({ type: "wait" });
		expect(decide({ checkout: null })).toEqual({ type: "wait" });
		expect(decide({ pullRequest: pr({ headBranch: null }) })).toEqual({
			type: "wait",
		});
	});

	test("fixes from another branch only from a clean working tree", () => {
		expect(
			decide({ checkout: { branch: "feature/other", clean: false } }),
		).toEqual({ type: "wait" });
		expect(
			decide({ checkout: { branch: "feature/other", clean: true } }),
		).toEqual({
			type: "fix",
			headSha: "a".repeat(40),
			attempt: 1,
			switchBranch: { to: "feature/42", returnBranch: "feature/other" },
		});
		expect(decide({ checkout: { branch: null, clean: true } })).toMatchObject({
			type: "fix",
			switchBranch: { to: "feature/42", returnBranch: null },
		});
	});
});
