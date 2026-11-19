import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../../types";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const hotkeys = new Map<string, () => void>();
let currentWorkspaceId: string | null = null;
let destinationWorkspaceId: string | null = null;
const navigate = mock(
	async ({ params }: { params: { workspaceId: string } }) => {
		destinationWorkspaceId = params.workspaceId;
	},
);
const router = {
	navigate,
	buildLocation: ({ params }: { params: { workspaceId: string } }) => ({
		pathname: `/workspace/${params.workspaceId}`,
	}),
	history: { subscribe: () => () => {} },
	get state() {
		return {
			isLoading: false,
			matches: [
				{ status: "success", params: { workspaceId: destinationWorkspaceId } },
			],
		};
	},
};
const frames: FrameRequestCallback[] = [];
const originalFrame = globalThis.requestAnimationFrame;
const toggleProjectCollapsed = mock(() => {});
const toggleSectionCollapsed = mock(() => {});
mock.module("renderer/hotkeys", () => ({
	useHotkey: (id: string, callback: () => void) => hotkeys.set(id, callback),
}));
mock.module("@tanstack/react-router", () => ({
	useRouter: () => router,
	useRouterState: () => "",
	useMatchRoute: () => () =>
		currentWorkspaceId ? { workspaceId: currentWorkspaceId } : false,
}));
mock.module(
	"renderer/routes/_authenticated/hooks/useDashboardSidebarState",
	() => ({
		useDashboardSidebarState: () => ({
			toggleProjectCollapsed,
			toggleSectionCollapsed,
		}),
	}),
);
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useDashboardSidebarShortcuts } = await import(
	"../useDashboardSidebarShortcuts"
);
const { useDeletingWorkspacesStore } = await import(
	"renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore"
);
const { useSidebarSectionsCollapseStore } = await import(
	"renderer/stores/sidebar-sections-collapse"
);

function workspace(
	id: string,
	projectId: string | null,
	isPinned = false,
): DashboardSidebarWorkspace {
	return {
		id,
		projectId,
		isPinned,
		hostId: "host",
		hostType: "local-device",
		type: projectId ? "worktree" : "session",
		hostIsOnline: true,
		accentColor: null,
		name: id,
		branch: "main",
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		lastActivityAt: null,
		taskId: null,
		pendingTransaction: null,
		isMine: null,
		creator: null,
		sandboxStatus: null,
	};
}
const pinnedWorkspaces = [
	workspace("pinned-project", "project", true),
	workspace("pinned-session", null, true),
];
const sessions = [workspace("session", null)];
const groups: DashboardSidebarProject[] = [
	{
		id: "project",
		name: "Project",
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		isCollapsed: true,
		children: [
			{
				type: "workspace",
				workspace: workspace("project-workspace", "project"),
			},
		],
	},
];

beforeEach(() => {
	currentWorkspaceId = null;
	destinationWorkspaceId = null;
	frames.length = 0;
	globalThis.requestAnimationFrame = (callback) => frames.push(callback);
	hotkeys.clear();
	navigate.mockClear();
	toggleProjectCollapsed.mockClear();
	toggleSectionCollapsed.mockClear();
	useDeletingWorkspacesStore.setState({ deletingIds: new Set() });
	useSidebarSectionsCollapseStore.setState({
		collapsed: {
			channels: false,
			cloud: false,
			devs: false,
			pinned: false,
			sessions: false,
			workspaces: false,
		},
	});
});
afterEach(() => {
	cleanup();
	globalThis.requestAnimationFrame = originalFrame;
});

async function flushNavigationEffects() {
	await act(async () => {
		await Promise.resolve();
		const tasks: (() => void)[] = [];
		const originalTimeout = globalThis.setTimeout;
		globalThis.setTimeout = ((callback: () => void) => {
			tasks.push(callback);
			return 1;
		}) as unknown as typeof setTimeout;
		try {
			for (const callback of frames.splice(0)) callback(0);
		} finally {
			globalThis.setTimeout = originalTimeout;
		}
		for (const callback of tasks) callback();
		await Promise.resolve();
	});
}

function press(id: string) {
	const callback = hotkeys.get(id);
	expect(callback).toBeDefined();
	act(() => callback?.());
}
function expectTarget(workspaceId: string) {
	expect(navigate).toHaveBeenLastCalledWith(
		expect.objectContaining({
			to: "/workspace/$workspaceId",
			params: { workspaceId },
		}),
	);
}

test.each([
	["NEXT_WORKSPACE", "pinned-project", "pinned-session"],
	["NEXT_WORKSPACE", "pinned-session", "session"],
	["NEXT_WORKSPACE", "session", "project-workspace"],
	["NEXT_WORKSPACE", "project-workspace", "pinned-project"],
	["PREV_WORKSPACE", "pinned-session", "pinned-project"],
	["PREV_WORKSPACE", "session", "pinned-session"],
	["PREV_WORKSPACE", "project-workspace", "session"],
	["PREV_WORKSPACE", "pinned-project", "project-workspace"],
])("%s from %s follows sidebar order to %s", (key, from, to) => {
	currentWorkspaceId = from;
	renderHook(() =>
		useDashboardSidebarShortcuts(groups, sessions, [], { pinnedWorkspaces }),
	);
	press(key);
	expectTarget(to);
});

test("navigates when every workspace is pinned and reveals collapsed pins", async () => {
	currentWorkspaceId = "pinned-project";
	useSidebarSectionsCollapseStore.getState().toggle("pinned");
	renderHook(() =>
		useDashboardSidebarShortcuts([], [], [], { pinnedWorkspaces }),
	);
	press("NEXT_WORKSPACE");
	expectTarget("pinned-session");
	expect(useSidebarSectionsCollapseStore.getState().collapsed.pinned).toBe(
		true,
	);
	await flushNavigationEffects();
	expect(useSidebarSectionsCollapseStore.getState().collapsed.pinned).toBe(
		false,
	);
	expect(toggleProjectCollapsed).not.toHaveBeenCalled();
});

test("leaves a collapsed Projects section collapsed for a pinned target", async () => {
	currentWorkspaceId = "project-workspace";
	useSidebarSectionsCollapseStore.setState({
		collapsed: {
			channels: false,
			cloud: false,
			devs: false,
			pinned: false,
			sessions: false,
			workspaces: true,
		},
	});
	renderHook(() =>
		useDashboardSidebarShortcuts(groups, sessions, [], { pinnedWorkspaces }),
	);
	press("NEXT_WORKSPACE");
	expectTarget("pinned-project");
	await flushNavigationEffects();
	expect(useSidebarSectionsCollapseStore.getState().collapsed.workspaces).toBe(
		true,
	);
});

test("skips a pinned workspace being deleted", () => {
	currentWorkspaceId = "pinned-project";
	useDeletingWorkspacesStore.getState().markDeleting("pinned-session");
	renderHook(() =>
		useDashboardSidebarShortcuts(groups, sessions, [], { pinnedWorkspaces }),
	);
	press("NEXT_WORKSPACE");
	expectTarget("session");
});

test("pin changes update navigation without renumbering regular workspace shortcuts", async () => {
	currentWorkspaceId = "session";
	const { result, rerender } = renderHook(
		({ pins }) =>
			useDashboardSidebarShortcuts(groups, sessions, [], {
				pinnedWorkspaces: pins,
			}),
		{
			initialProps: { pins: pinnedWorkspaces },
		},
	);
	expect(result.current.get("session")).toBe("⌘1");
	press("JUMP_TO_WORKSPACE_1");
	expectTarget("session");
	rerender({ pins: [pinnedWorkspaces[0]] });
	press("PREV_WORKSPACE");
	expectTarget("pinned-project");
	rerender({ pins: [] });
	press("PREV_WORKSPACE");
	expectTarget("project-workspace");
	expect(toggleProjectCollapsed).not.toHaveBeenCalled();
	await flushNavigationEffects();
	expect(toggleProjectCollapsed).toHaveBeenCalledWith("project");
});
