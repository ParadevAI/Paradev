import { useSwitcherGroups } from "renderer/commandPalette/ui/WorkspaceList/hooks/useSwitcherGroups";

export type WaitingWorkspaceBucket = "needsInput" | "completed";

/** Null when no sidebar workspace other than the current one waits on the user. */
export function useWaitingWorkspaceBucket(): WaitingWorkspaceBucket | null {
	const { groups } = useSwitcherGroups("");
	for (const bucket of ["needsInput", "completed"] as const) {
		const group = groups.find((candidate) => candidate.bucket === bucket);
		if (group?.rows.some((row) => !row.isCurrent)) return bucket;
	}
	return null;
}
