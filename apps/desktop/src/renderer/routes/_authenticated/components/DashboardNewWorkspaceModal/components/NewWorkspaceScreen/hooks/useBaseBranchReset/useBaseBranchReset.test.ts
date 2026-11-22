import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useBaseBranchReset } = await import("./useBaseBranchReset");
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);
const { environmentBranchKey, useWorkspaceCreateDefaultsStore } = await import(
	"renderer/stores/workspace-create-defaults"
);
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	useNewWorkspaceDraftStore.getState().resetDraft();
	useWorkspaceCreateDefaultsStore.setState({ baseBranchesByProjectId: {} });
});

interface Target {
	branchDefaultKey: string | null;
	hostId: string | null;
}

function renderBaseBranch(initial: Target) {
	return renderHook(
		(target: Target) => {
			const draft = useNewWorkspaceDraftStore();
			useBaseBranchReset({ ...target, updateDraft: draft.updateDraft });
			return {
				baseBranch: draft.baseBranch,
				baseBranchSource: draft.baseBranchSource,
			};
		},
		{ initialProps: initial },
	);
}

/** What a sidebar "+" does: select the project, then mount the screen. */
function leaveBaseThenSelect(projectId: string) {
	const draft = useNewWorkspaceDraftStore.getState();
	draft.updateDraft({ baseBranch: "develop", baseBranchSource: "local" });
	draft.selectProject(projectId);
}

test("drops a base left over from another project when it mounts", () => {
	leaveBaseThenSelect("superset");

	const { result } = renderBaseBranch({
		branchDefaultKey: "superset",
		hostId: "machine",
	});

	expect(result.current).toEqual({ baseBranch: null, baseBranchSource: null });
});

test("applies the project's saved base when it mounts", () => {
	useWorkspaceCreateDefaultsStore
		.getState()
		.setBaseBranchDefault("cooknco", "release", "remote-tracking");
	leaveBaseThenSelect("cooknco");

	const { result } = renderBaseBranch({
		branchDefaultKey: "cooknco",
		hostId: "machine",
	});

	expect(result.current).toEqual({
		baseBranch: "release",
		baseBranchSource: "remote-tracking",
	});
});

test("keeps the draft's base while open, and resets it on a key change", () => {
	const { result, rerender } = renderBaseBranch({
		branchDefaultKey: "padel-manager",
		hostId: "machine",
	});

	act(() => {
		useNewWorkspaceDraftStore
			.getState()
			.updateDraft({ baseBranch: "hotfix", baseBranchSource: "local" });
		useWorkspaceCreateDefaultsStore
			.getState()
			.setBaseBranchDefault("padel-manager", "staging", "local");
	});
	expect(result.current.baseBranch).toBe("hotfix");

	rerender({ branchDefaultKey: "superset", hostId: "machine" });
	expect(result.current).toEqual({ baseBranch: null, baseBranchSource: null });
});

test("re-seeds the saved base when the host changes", () => {
	useWorkspaceCreateDefaultsStore
		.getState()
		.setBaseBranchDefault("cooknco", "release", "remote-tracking");
	const { result, rerender } = renderBaseBranch({
		branchDefaultKey: "cooknco",
		hostId: "machine",
	});

	act(() => {
		useNewWorkspaceDraftStore
			.getState()
			.updateDraft({ baseBranch: "hotfix", baseBranchSource: "local" });
	});
	expect(result.current.baseBranch).toBe("hotfix");

	rerender({ branchDefaultKey: "cooknco", hostId: "other-host" });
	expect(result.current).toEqual({
		baseBranch: "release",
		baseBranchSource: "remote-tracking",
	});
});

test("applies the environment's saved base once the cloud environment resolves", () => {
	const envKey = environmentBranchKey("env-1");
	useWorkspaceCreateDefaultsStore
		.getState()
		.setBaseBranchDefault(envKey, "trunk", "remote-tracking");
	leaveBaseThenSelect("cooknco");

	const { result, rerender } = renderBaseBranch({
		branchDefaultKey: null,
		hostId: "cloud",
	});
	expect(result.current).toEqual({ baseBranch: null, baseBranchSource: null });

	rerender({ branchDefaultKey: envKey, hostId: "cloud" });
	expect(result.current).toEqual({
		baseBranch: "trunk",
		baseBranchSource: "remote-tracking",
	});
});
