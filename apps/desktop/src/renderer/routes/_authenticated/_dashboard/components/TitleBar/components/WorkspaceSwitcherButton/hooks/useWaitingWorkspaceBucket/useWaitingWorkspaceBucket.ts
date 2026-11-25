import { useSwitcherGroups } from "renderer/commandPalette/ui/WorkspaceList/hooks/useSwitcherGroups";

export type WaitingWorkspaceBucket = "needsInput" | "failed" | "completed";

/** Null when no sidebar workspace other than the current one waits on the user. */
export function useWaitingWorkspaceBucket(): WaitingWorkspaceBucket | null {
	const { groups } = useSwitcherGroups("");
	const waiting = (bucket: "needsInput" | "completed") =>
		groups
			.find((candidate) => candidate.bucket === bucket)
			?.rows.filter((row) => !row.isCurrent) ?? [];
	if (waiting("needsInput").length > 0) return "needsInput";
	// The switcher lists a failed agent under Completed; the dot must not
	// show it as a success.
	const completed = waiting("completed");
	if (completed.some((row) => row.workspace.agentStatus === "failed")) {
		return "failed";
	}
	return completed.length > 0 ? "completed" : null;
}
