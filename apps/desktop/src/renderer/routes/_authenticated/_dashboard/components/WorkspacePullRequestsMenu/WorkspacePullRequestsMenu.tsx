import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { type SyntheticEvent, useEffect, useState } from "react";
import { LuGitPullRequest } from "react-icons/lu";
import { usePullRequestLinkPolicy } from "renderer/lib/clickPolicy";
import { openPullRequestLink } from "renderer/lib/github/openPullRequestLink";
import type { WorkspacePullRequestSummary } from "renderer/lib/github/workspacePullRequests";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";
import { PullRequestStatusBadge } from "../PullRequestStatusBadge";

interface WorkspacePullRequestsMenuProps {
	workspaceId: string;
	pullRequests: readonly WorkspacePullRequestSummary[] | undefined;
	currentUrl?: string | null;
	archived?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function stopRowEvent(event: SyntheticEvent) {
	event.stopPropagation();
}

export function WorkspacePullRequestsMenu({
	workspaceId,
	pullRequests = [],
	currentUrl,
	archived = false,
	onOpenChange,
}: WorkspacePullRequestsMenuProps) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const navigate = useNavigate();
	const linkPolicy = usePullRequestLinkPolicy();
	const [open, setOpen] = useState(false);
	const visible =
		pullRequests.length > 0 && !(pullRequests.length === 1 && currentUrl);
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
	};
	useEffect(() => {
		if (!visible && open) {
			setOpen(false);
			onOpenChange?.(false);
		}
	}, [visible, open, onOpenChange]);
	if (!visible) return null;

	return (
		<DropdownMenu open={open} onOpenChange={changeOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`${t({ message: "Open pull requests" })} (${formatNumber(pullRequests.length)})`}
					className="flex h-6 shrink-0 items-center gap-1 rounded px-1 text-[11px] tabular-nums text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
					onPointerDown={stopRowEvent}
					onMouseDown={stopRowEvent}
					onClick={stopRowEvent}
					onDoubleClick={stopRowEvent}
					onKeyDown={stopRowEvent}
				>
					<LuGitPullRequest className="size-3" aria-hidden="true" />
					{formatNumber(pullRequests.length)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-80 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto"
				onPointerDown={stopRowEvent}
				onMouseDown={stopRowEvent}
				onClick={stopRowEvent}
				onDoubleClick={stopRowEvent}
				onKeyDown={stopRowEvent}
			>
				<DropdownMenuLabel>
					<Trans>Pull requests</Trans>
				</DropdownMenuLabel>
				{pullRequests.map((pr) => (
					<DropdownMenuItem key={pr.url} asChild>
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-start gap-2"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								changeOpen(false);
								openPullRequestLink(
									pr.url,
									archived ? "external" : linkPolicy.getAction(event),
									(ref, placement) => {
										usePullRequestPaneIntent
											.getState()
											.request({ workspaceId, ...ref, placement });
										void navigateToV2Workspace(workspaceId, navigate);
									},
								);
							}}
						>
							<PRIcon state={pr.state} className="mt-0.5 size-3.5 shrink-0" />
							<span className="min-w-0 flex-1 space-y-1">
								<span className="flex flex-wrap items-center gap-1.5">
									<span className="text-xs tabular-nums">#{pr.number}</span>
									<PullRequestStatusBadge state={pr.state} />
									{pr.url === currentUrl && (
										<span className="text-[10px] text-muted-foreground">
											<Trans>Current</Trans>
										</span>
									)}
								</span>
								<span className="block break-words text-xs leading-relaxed">
									{pr.title}
								</span>
							</span>
						</a>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
