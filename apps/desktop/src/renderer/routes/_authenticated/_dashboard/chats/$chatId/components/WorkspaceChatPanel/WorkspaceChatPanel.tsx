import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuMaximize2, LuX } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { WorkspaceProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { WorkspaceChat } from "./components/WorkspaceChat";

const ACTION =
	"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground";

interface WorkspaceChatPanelProps {
	workspaceId: string;
	onClose: () => void;
}

/**
 * A workspace's chat beside the thread: read it and reply without leaving
 * the conversation, or open the whole workspace.
 */
export function WorkspaceChatPanel({
	workspaceId,
	onClose,
}: WorkspaceChatPanelProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((row) => row.id === workspaceId);
	const open = () => void navigateToV2Workspace(workspaceId, navigate);
	return (
		<aside className="flex h-full w-[460px] shrink-0 flex-col border-border border-l">
			<div className="flex h-12 shrink-0 items-center gap-1 pr-3 pl-4">
				<div className="flex min-w-0 flex-1 items-baseline gap-2">
					<h2 className="truncate font-medium text-sm">
						{workspace?.name ?? <Trans>Workspace</Trans>}
					</h2>
					{workspace?.branch && workspace.branch !== workspace.name && (
						<span className="truncate text-muted-foreground text-xs">
							{workspace.branch}
						</span>
					)}
				</div>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Open workspace" })}
							onClick={open}
							className={ACTION}
						>
							<LuMaximize2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Open workspace</Trans>
					</TooltipContent>
				</Tooltip>
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className={ACTION}
				>
					<LuX className="size-4" />
				</button>
			</div>
			<div className="relative flex min-h-0 flex-1 flex-col">
				{workspace ? (
					<WorkspaceProvider workspace={workspace}>
						<WorkspaceChat workspaceId={workspaceId} />
					</WorkspaceProvider>
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
						<Trans>This workspace isn't on a host this app can reach.</Trans>
					</div>
				)}
			</div>
		</aside>
	);
}
