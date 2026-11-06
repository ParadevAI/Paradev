import { describe, expect, test } from "bun:test";
import type { PaneStatus } from "shared/tabs-types";
import { hasLiveWorkspaceState } from "./hasLiveWorkspaceState";

function make(overrides: {
	agentStatus?: PaneStatus;
	sandboxStatus?: "provisioning" | "failed" | null;
	type?: "local" | "worktree" | "session";
	prState?: "open" | "merged" | null;
}) {
	return {
		agentStatus: overrides.agentStatus ?? ("idle" as const),
		sandboxStatus: overrides.sandboxStatus ?? null,
		type: overrides.type ?? ("worktree" as const),
		pr: overrides.prState ? { state: overrides.prState } : null,
		archivedAt: null,
		archiveReason: null,
	};
}

describe("hasLiveWorkspaceState", () => {
	test("agent activity, waiting and failure are live", () => {
		expect(hasLiveWorkspaceState(make({ agentStatus: "working" }))).toBe(true);
		expect(hasLiveWorkspaceState(make({ agentStatus: "permission" }))).toBe(
			true,
		);
		expect(hasLiveWorkspaceState(make({ agentStatus: "failed" }))).toBe(true);
	});

	test("sandbox states are live", () => {
		expect(hasLiveWorkspaceState(make({ sandboxStatus: "provisioning" }))).toBe(
			true,
		);
		expect(hasLiveWorkspaceState(make({ sandboxStatus: "failed" }))).toBe(true);
	});

	test("finished-unread is live only on project workspaces", () => {
		expect(hasLiveWorkspaceState(make({ agentStatus: "review" }))).toBe(true);
		expect(
			hasLiveWorkspaceState(make({ agentStatus: "review", type: "session" })),
		).toBe(false);
	});

	test("an archived row is never live, whatever its stale agent status", () => {
		expect(
			hasLiveWorkspaceState({
				...make({ agentStatus: "working" }),
				archivedAt: 1,
				archiveReason: "deleted",
			}),
		).toBe(false);
	});

	test("idle and in-review rows show the age instead", () => {
		expect(hasLiveWorkspaceState(make({}))).toBe(false);
		expect(hasLiveWorkspaceState(make({ prState: "open" }))).toBe(false);
	});
});
