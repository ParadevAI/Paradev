import type { Workspace, Worktree } from "shared/types";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees,
	onToggleWorktree,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
}: WorktreeListProps) {
	if (!currentWorkspace) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">No workspace open</div>
		);
	}

	if (!currentWorkspace.worktrees || currentWorkspace.worktrees.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No worktrees yet. Create one to get started.
			</div>
		);
	}

	// Check if workspace has port forwarding configured
	const hasPortForwarding =
		currentWorkspace.ports && currentWorkspace.ports.length > 0;

	return (
		<>
			{currentWorkspace.worktrees.map((worktree) => (
				<WorktreeItem
					key={worktree.id}
					worktree={worktree}
					workspaceId={currentWorkspace.id}
					activeWorktreeId={currentWorkspace.activeWorktreeId}
					isExpanded={expandedWorktrees.has(worktree.id)}
					onToggle={onToggleWorktree}
					onTabSelect={onTabSelect}
					onReload={onReload}
					onUpdateWorktree={(updatedWorktree) =>
						onUpdateWorktree(worktree.id, updatedWorktree)
					}
					selectedTabId={selectedTabId}
					hasPortForwarding={hasPortForwarding}
				/>
			))}
		</>
	);
}
