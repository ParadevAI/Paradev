import { Avatar } from "@superset/ui/atoms/Avatar";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface WorkspaceOwnerAvatarProps {
	workspace: Pick<
		AccessibleV2Workspace,
		"isCreatedByCurrentUser" | "createdByName" | "createdByImage"
	>;
}

/** The owner, only when it isn't you: a row with no owner is unreadable
 * once teammates' rows share the list. */
export function WorkspaceOwnerAvatar({ workspace }: WorkspaceOwnerAvatarProps) {
	if (workspace.isCreatedByCurrentUser || !workspace.createdByName) {
		return null;
	}
	return (
		<span title={workspace.createdByName}>
			<Avatar
				fullName={workspace.createdByName}
				image={workspace.createdByImage}
				className="size-4 text-[8px]"
			/>
		</span>
	);
}
