import { useHotkey } from "renderer/hotkeys";
import { useCopyWorktreePath } from "../useCopyWorktreePath";
import { useWorkspaceOpenInTarget } from "../useWorkspaceOpenInTarget";

export function useCopyPathHotkey(workspaceId: string) {
	const worktreePath =
		useWorkspaceOpenInTarget(workspaceId)?.worktreePath ?? null;
	const copyPath = useCopyWorktreePath();

	useHotkey(
		"COPY_PATH",
		() => {
			if (!worktreePath || copyPath.isPending) return;
			copyPath.mutate(worktreePath);
		},
		{ enabled: worktreePath !== null },
	);
}
