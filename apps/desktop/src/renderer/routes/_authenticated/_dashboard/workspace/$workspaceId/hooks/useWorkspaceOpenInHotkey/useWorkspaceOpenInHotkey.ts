import { useWorkspaceOpenIn } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenIn";
import { useWorkspaceOpenInTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenInTarget";

/** Binds "open in app" to the open workspace for as long as its page is mounted. */
export function useWorkspaceOpenInHotkey(workspaceId: string): void {
	const target = useWorkspaceOpenInTarget(workspaceId);
	useWorkspaceOpenIn({
		worktreePath: target?.worktreePath ?? null,
		projectId: target?.projectId ?? null,
	});
}
