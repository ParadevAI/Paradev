import { describe, expect, test } from "bun:test";
import type { PaneStatus } from "shared/tabs-types";
import { deriveBoardColumn } from "./deriveBoardColumn";

function make(overrides: {
	archivedAt?: number | null;
	archiveReason?: "merged" | "deleted" | null;
	agentStatus?: PaneStatus;
	prState?: "open" | "draft" | "merged" | "closed" | "queued" | null;
	type?: "local" | "worktree" | "session";
	sandboxStatus?: "provisioning" | "failed" | null;
}) {
	return {
		archivedAt: overrides.archivedAt ?? null,
		archiveReason: overrides.archiveReason ?? null,
		agentStatus: overrides.agentStatus ?? ("idle" as const),
		pr: overrides.prState ? { state: overrides.prState } : null,
		type: overrides.type ?? ("worktree" as const),
		sandboxStatus: overrides.sandboxStatus ?? null,
	};
}

describe("deriveBoardColumn", () => {
	test("archived rows land in Deleted or Merged by reason", () => {
		expect(
			deriveBoardColumn(make({ archivedAt: 1, archiveReason: "deleted" })),
		).toBe("deleted");
		expect(
			deriveBoardColumn(make({ archivedAt: 1, archiveReason: "merged" })),
		).toBe("merged");
	});

	test("archived wins over live signals", () => {
		expect(
			deriveBoardColumn(
				make({
					archivedAt: 1,
					archiveReason: "deleted",
					agentStatus: "working",
					prState: "merged",
				}),
			),
		).toBe("deleted");
	});

	test("live merged PR lands in Merged even while the agent works", () => {
		expect(
			deriveBoardColumn(make({ prState: "merged", agentStatus: "working" })),
		).toBe("merged");
	});

	test("permission and failed outrank working", () => {
		expect(deriveBoardColumn(make({ agentStatus: "permission" }))).toBe(
			"attention",
		);
		expect(
			deriveBoardColumn(make({ agentStatus: "failed", prState: "open" })),
		).toBe("attention");
	});

	test("a failed sandbox needs attention; one being made is working", () => {
		expect(
			deriveBoardColumn(
				make({ sandboxStatus: "failed", agentStatus: "working" }),
			),
		).toBe("attention");
		expect(deriveBoardColumn(make({ sandboxStatus: "provisioning" }))).toBe(
			"working",
		);
	});

	test("working outranks finished and review signals", () => {
		expect(
			deriveBoardColumn(make({ agentStatus: "working", prState: "open" })),
		).toBe("working");
	});

	test("a finished, unread agent is Finished even with an open PR", () => {
		expect(deriveBoardColumn(make({ agentStatus: "review" }))).toBe("finished");
		expect(
			deriveBoardColumn(make({ agentStatus: "review", prState: "open" })),
		).toBe("finished");
	});

	test("an open, draft or queued PR with nothing unread is In review", () => {
		expect(deriveBoardColumn(make({ prState: "open" }))).toBe("review");
		expect(deriveBoardColumn(make({ prState: "draft" }))).toBe("review");
		expect(deriveBoardColumn(make({ prState: "queued" }))).toBe("review");
	});

	test("a finished agent on a session workspace is Idle, not Finished", () => {
		expect(
			deriveBoardColumn(make({ agentStatus: "review", type: "session" })),
		).toBe("idle");
	});

	test("an open PR means review even on session and local workspaces", () => {
		expect(
			deriveBoardColumn(
				make({ agentStatus: "review", type: "session", prState: "open" }),
			),
		).toBe("review");
		expect(deriveBoardColumn(make({ type: "local", prState: "open" }))).toBe(
			"review",
		);
	});

	test("no signals (or a closed PR) is Idle", () => {
		expect(deriveBoardColumn(make({}))).toBe("idle");
		expect(deriveBoardColumn(make({ prState: "closed" }))).toBe("idle");
	});
});
