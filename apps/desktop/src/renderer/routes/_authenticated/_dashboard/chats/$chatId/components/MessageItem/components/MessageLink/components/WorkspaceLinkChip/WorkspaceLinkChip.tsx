import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuArrowUpRight, LuFolderGit2 } from "react-icons/lu";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useMessageAuthorDevId } from "../../../../providers/MessageAuthorDevProvider";

interface WorkspaceLinkChipProps {
	workspaceId: string;
	href: string;
	children: ReactNode;
}

/**
 * A link to a workspace, shown as a row like the sidebar's: the Dev that
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
			className="group/workspace my-0.5 inline-flex h-8 max-w-full items-center gap-2 rounded-lg bg-foreground/[0.06] pr-2 pl-1.5 align-middle text-sm text-foreground no-underline ring-1 ring-foreground/10 ring-inset transition-colors hover:bg-foreground/10 hover:ring-foreground/20"
		>
			{devId ? (
				<FaceAvatar seed={devId} size={20} />
			) : (
				<span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-foreground/10 text-muted-foreground">
					<LuFolderGit2 className="size-3" aria-hidden="true" />
				</span>
			)}
			<span className="min-w-0 truncate font-medium">{name}</span>
			{branch && (
				<span className="hidden min-w-0 max-w-40 truncate font-mono text-[11px] text-muted-foreground sm:inline">
					{branch}
				</span>
			)}
			<LuArrowUpRight
				className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/workspace:translate-x-0.5 group-hover/workspace:-translate-y-0.5 group-hover/workspace:text-foreground"
				aria-hidden="true"
			/>
		</a>
	);
}
