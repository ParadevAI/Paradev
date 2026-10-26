import { afterEach, describe, expect, test } from "bun:test";
import type {
	AccessibleV2Workspace,
	V2WorkspacePrState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { WorkspaceStateGlyph } = await import("./WorkspaceStateGlyph");

const UNREAD_DOT = ".bg-green-500";

function make(
	overrides: Partial<AccessibleV2Workspace> & { prState?: V2WorkspacePrState },
): AccessibleV2Workspace {
	const { prState, ...rest } = overrides;
	return {
		id: "ws",
		name: "ws",
		branch: "feat",
		type: "worktree",
		createdAt: new Date(0),
		createdByUserId: null,
		createdByName: null,
		createdByImage: null,
		isCreatedByCurrentUser: true,
		projectId: "p",
		projectName: "p",
		projectIconUrl: null,
		hostId: "h",
		hostName: "h",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: true,
		pr: prState
			? {
					prNumber: 1,
					title: "pr",
					url: "https://example.test/pr/1",
					state: prState,
					checksStatus: "none",
					reviewDecision: "pending",
					checks: [],
					mergedAt: null,
				}
			: null,
		agentStatus: "idle",
		lastAgentEventAt: null,
		diffStats: null,
		sandboxStatus: null,
		seenMarks: { terminals: [], reportedAt: null },
		archivedAt: null,
		archiveReason: null,
		...rest,
	};
}

afterEach(cleanup);

describe("WorkspaceStateGlyph", () => {
	test("an open PR with nothing unread shows the In review icon, not the unread dot", () => {
		const { container } = render(
			<WorkspaceStateGlyph
				workspace={make({ agentStatus: "idle", prState: "open" })}
			/>,
		);

		expect(container.querySelector(UNREAD_DOT)).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
	});

	test("unread agent output shows the dot even with an open PR", () => {
		const { container } = render(
			<WorkspaceStateGlyph
				workspace={make({ agentStatus: "review", prState: "open" })}
			/>,
		);

		expect(container.querySelector(UNREAD_DOT)).not.toBeNull();
	});

	test("a session row with unread output shows the dot though it is filed under Idle", () => {
		const { container } = render(
			<WorkspaceStateGlyph
				workspace={make({ agentStatus: "review", type: "session" })}
			/>,
		);

		expect(container.querySelector(UNREAD_DOT)).not.toBeNull();
	});
});
