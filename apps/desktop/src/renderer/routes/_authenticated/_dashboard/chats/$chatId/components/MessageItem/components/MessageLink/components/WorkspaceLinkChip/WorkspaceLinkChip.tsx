import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuFolderGit2 } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useMessageAuthorDevId } from "../../../../providers/MessageAuthorDevProvider";

interface WorkspaceLinkChipProps {
	workspaceId: string;
	href: string;
	children: ReactNode;
}

/**
 * A link to a workspace, in the style of a shared file's card: the Dev that
 * linked it, the workspace's name and its branch. Opens the workspace here.
 */
export function WorkspaceLinkChip({
	workspaceId,
	href,
	children,
}: WorkspaceLinkChipProps) {
	const navigate = useNavigate();
	const devId = useMessageAuthorDevId();
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((row) => row.id === workspaceId);
	const linkedByAddress = typeof children === "string" && children === href;
	const name =
		workspace?.name ?? (linkedByAddress ? workspaceId.slice(0, 8) : children);
	const branch =
		workspace?.branch && workspace.branch !== workspace.name
			? workspace.branch
			: null;
	return (
		<a
			href={href}
			onClick={(event) => {
				event.preventDefault();
				void navigateToV2Workspace(workspaceId, navigate);
			}}
			className="my-0.5 inline-flex max-w-full items-center gap-2 rounded-lg bg-background/50 py-1 pr-2.5 pl-1.5 align-middle text-sm text-foreground no-underline transition-colors hover:bg-background/80"
		>
			{devId ? (
				<DevFace devId={devId} size={20} />
			) : (
				<span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10">
					<LuFolderGit2 className="size-3" aria-hidden="true" />
				</span>
			)}
			<span className="min-w-0 truncate font-medium">{name}</span>
			{branch && (
				<span className="min-w-0 max-w-40 truncate text-xs text-muted-foreground">
					{branch}
				</span>
			)}
		</a>
	);
}
