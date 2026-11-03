import { afterEach, expect, mock, test } from "bun:test";

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useProjectPreselection } = await import("./useProjectPreselection");
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);

import type {
	WorkspaceCreateProjectChoice,
	WorkspaceCreateTarget,
} from "renderer/stores/v2-workspace-create-defaults";

afterEach(cleanup);

interface TargetProps {
	target: WorkspaceCreateTarget;
	lastChoice: WorkspaceCreateProjectChoice;
	projects: { id: string }[];
}
test("holds the intended project while its list refreshes, then permits manual selection", () => {
	useNewWorkspaceDraftStore.getState().resetDraft();
	useNewWorkspaceDraftStore.getState().selectProject("new-project");
	const { result, rerender } = renderHook(
		({ projects, requested }) => {
			const draft = useNewWorkspaceDraftStore();
			const { isPending: pending } = useProjectPreselection({
				isOpen: true,
				areProjectsReady: true,
				projects,
				preSelectedProjectId: requested,
				preSelectedSession: false,
				selectedProjectId: draft.selectedProjectId,
				isSession: draft.isSession,
				target: "device",
				lastChoice: { kind: "project", projectId: "old-project" },
				selectProject: draft.selectProject,
				selectSession: draft.selectSession,
				updateDraft: draft.updateDraft,
			});
			return { pending, selectedProjectId: draft.selectedProjectId };
		},
		{
			initialProps: {
				projects: [{ id: "old-project" }],
				requested: "new-project",
			},
		},
	);
	expect(result.current).toEqual({
		pending: true,
		selectedProjectId: "new-project",
	});
	rerender({ projects: [{ id: "old-project" }], requested: "new-project" });
	expect(result.current).toEqual({
		pending: true,
		selectedProjectId: "new-project",
	});
	rerender({
		projects: [{ id: "old-project" }, { id: "new-project" }],
		requested: "new-project",
	});
	expect(result.current).toEqual({
		pending: false,
		selectedProjectId: "new-project",
	});
	act(() => useNewWorkspaceDraftStore.getState().selectProject("old-project"));
	expect(result.current).toEqual({
		pending: false,
		selectedProjectId: "old-project",
	});
	rerender({
		projects: [{ id: "old-project" }, { id: "new-project" }],
		requested: "third-project",
	});
	expect(result.current.pending).toBe(true);
});

test("direct URL preselection blocks a remembered project until the requested project arrives", () => {
	const selectProject = mock();
	const updateDraft = mock();
	const { result, rerender } = renderHook(
		({ projects }) =>
			useProjectPreselection({
				isOpen: true,
				areProjectsReady: true,
				projects,
				preSelectedProjectId: "new-project",
				preSelectedSession: false,
				selectedProjectId: "old-project",
				isSession: false,
				target: "device",
				lastChoice: { kind: "project", projectId: "old-project" },
				selectProject,
				selectSession: mock(),
				updateDraft,
			}).isPending,
		{ initialProps: { projects: [{ id: "old-project" }] } },
	);
	expect(result.current).toBe(true);
	expect(selectProject).not.toHaveBeenCalled();
	expect(updateDraft).not.toHaveBeenCalled();
	rerender({ projects: [{ id: "old-project" }, { id: "new-project" }] });
	expect(selectProject).toHaveBeenCalledWith("new-project");
	expect(result.current).toBe(false);
});

test("a manual pick ends the wait for a requested project that never arrives", () => {
	const { result } = renderHook(() =>
		useProjectPreselection({
			isOpen: true,
			areProjectsReady: true,
			projects: [{ id: "paradev" }],
			preSelectedProjectId: "missing-project",
			preSelectedSession: false,
			selectedProjectId: "paradev",
			isSession: false,
			target: "device",
			lastChoice: { kind: "project", projectId: "paradev" },
			selectProject: mock(),
			selectSession: mock(),
			updateDraft: mock(),
		}),
	);
	expect(result.current.isPending).toBe(true);
	act(() => result.current.releasePreselection());
	expect(result.current.isPending).toBe(false);
});

test("restores a remembered No project choice", () => {
	const selectSession = mock();
	const updateDraft = mock();
	renderHook(() =>
		useProjectPreselection({
			isOpen: true,
			areProjectsReady: true,
			projects: [{ id: "project" }],
			preSelectedProjectId: null,
			preSelectedSession: false,
			selectedProjectId: null,
			isSession: false,
			target: "device",
			lastChoice: { kind: "none" },
			selectProject: mock(),
			selectSession,
			updateDraft,
		}),
	);
	expect(selectSession).toHaveBeenCalled();
	expect(updateDraft).not.toHaveBeenCalled();
});

test("switching target restores that target's own choice", () => {
	useNewWorkspaceDraftStore.getState().resetDraft();
	const { result, rerender } = renderHook(
		({ target, lastChoice, projects }: TargetProps) => {
			const draft = useNewWorkspaceDraftStore();
			useProjectPreselection({
				isOpen: true,
				areProjectsReady: true,
				projects,
				preSelectedProjectId: null,
				preSelectedSession: false,
				selectedProjectId: draft.selectedProjectId,
				isSession: draft.isSession,
				target,
				lastChoice,
				selectProject: draft.selectProject,
				selectSession: draft.selectSession,
				updateDraft: draft.updateDraft,
			});
			return draft;
		},
		{
			initialProps: {
				target: "device",
				lastChoice: { kind: "project", projectId: "local" },
				projects: [{ id: "repo" }, { id: "local" }],
			} as TargetProps,
		},
	);
	expect(result.current.selectedProjectId).toBe("local");
	rerender({
		target: "cloud",
		lastChoice: { kind: "none" },
		projects: [{ id: "repo" }],
	});
	expect(result.current.isSession).toBe(true);
	rerender({
		target: "device",
		lastChoice: { kind: "project", projectId: "local" },
		projects: [{ id: "repo" }, { id: "local" }],
	});
	expect(result.current.isSession).toBe(false);
	expect(result.current.selectedProjectId).toBe("local");
});
