import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import {
	LuArrowUpRight,
	LuEllipsis,
	LuGitPullRequest,
	LuX,
} from "react-icons/lu";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";
import { useAgentSession } from "../../../../../../hooks/useAgentSession";
import { useAgentWorkspace } from "../../../../../../hooks/useAgentWorkspace";
import { channelTag } from "../../../../../../hooks/useChannelAgents";

interface AgentPageActionsProps {
	workspaceId: string;
	channelName: string;
	onClose: () => void;
}

/** The pane header's controls for an agent: open its workspace, or more. */
export function AgentPageActions({
	workspaceId,
	channelName,
	onClose,
}: AgentPageActionsProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { workspace, hostRow, hostUrl } = useAgentWorkspace(workspaceId);
	const session = useAgentSession(workspaceId, hostUrl);
	const { v2Workspaces } = useOptimisticActions();
	const requestPrPane = usePullRequestPaneIntent((state) => state.request);
	if (!workspace || !hostRow) return null;

	const pr = workspace.pr;
	const tag = channelTag(channelName);
	const openWorkspace = () =>
		void navigateToV2Workspace(workspaceId, navigate, {
			search: session.data
				? {
						sessionId: session.data.sessionId,
						focusRequestId: crypto.randomUUID(),
					}
				: {},
		});
	const openPr = () => {
		if (!pr) return;
		const ref = pullRequestRefFromUrl(pr.url);
		if (ref) requestPrPane({ workspaceId, ...ref });
		openWorkspace();
	};
	const removeFromChannel = () => {
		v2Workspaces.updateWorkspace(workspaceId, {
			tags: (hostRow.tags ?? []).filter((candidate) => candidate !== tag),
		});
		onClose();
	};
	return (
		<>
			<button
				type="button"
				onClick={openWorkspace}
				className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground [&_svg]:size-3.5"
			>
				<LuArrowUpRight />
				<Trans>Open workspace</Trans>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Agent options" })}
						className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						<LuEllipsis className="size-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuItem onSelect={openWorkspace}>
						<LuArrowUpRight className="size-4" />
						<Trans>Open workspace</Trans>
					</DropdownMenuItem>
					{pr && (
						<DropdownMenuItem onSelect={openPr}>
							<LuGitPullRequest className="size-4" />
							{t({ message: `Open pull request #${pr.prNumber}` })}
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={removeFromChannel}>
						<LuX className="size-4" />
						<Trans>Remove from this channel</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
