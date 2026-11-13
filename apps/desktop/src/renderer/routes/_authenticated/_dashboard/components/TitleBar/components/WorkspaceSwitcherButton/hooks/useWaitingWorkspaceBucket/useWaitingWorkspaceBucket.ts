import { useSwitcherGroups } from "renderer/commandPalette/ui/WorkspaceList/hooks/useSwitcherGroups";

export type WaitingWorkspaceBucket = "needsInput" | "completed";

/** The most urgent state among the sidebar's other workspaces, or null when none waits on the user. */
export function useWaitingWorkspaceBucket(): WaitingWorkspaceBucket | null {
	const { groups } = useSwitcherGroups("");
	for (const bucket of ["needsInput", "completed"] as const) {
		const group = groups.find((candidate) => candidate.bucket === bucket);
		if (group?.rows.some((row) => !row.isCurrent)) return bucket;
	}
	return null;
}
