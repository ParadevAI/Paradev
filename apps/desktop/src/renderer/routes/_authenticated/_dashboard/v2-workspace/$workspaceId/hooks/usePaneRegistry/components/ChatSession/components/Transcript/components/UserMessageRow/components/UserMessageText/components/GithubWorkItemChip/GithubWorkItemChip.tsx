import { useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { CircleDot, GitPullRequest } from "lucide-react";
import { useState } from "react";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import type { GithubWorkItemLink } from "../../../../../../../../utils/githubWorkItem";
import {
	GithubWorkItemCard,
	type GithubWorkItemLoad,
} from "./components/GithubWorkItemCard";

const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 100;
const FRESH_FOR_MS = 2 * 60 * 1000;

/**
 * A pull request or issue someone pasted, as a small coloured chip, with a
 * card on hover or focus that the host fills in from GitHub once asked.
 */
export function GithubWorkItemChip({
	link,
	url,
}: {
	link: GithubWorkItemLink;
	url: string;
}) {
	const { t } = useLingui();
	const { openLink, workspaceId } = useChatPaneActions();
	const [open, setOpen] = useState(false);
	const query = workspaceTrpc.github.getWorkItem.useQuery(
		{
			owner: link.owner,
			repo: link.repo,
			kind: link.kind,
			number: link.number,
		},
		{
			enabled: open && Boolean(workspaceId),
			staleTime: FRESH_FOR_MS,
			retry: false,
		},
	);
	const load: GithubWorkItemLoad = query.data
		? { status: "ready", item: query.data }
		: query.isError || !workspaceId
			? { status: "unavailable" }
			: { status: "loading" };
	const pr = link.kind === "pr";
	const label = pr
		? t({ message: `PR #${link.number}` })
		: t({ message: `Issue #${link.number}` });
	const Icon = pr ? GitPullRequest : CircleDot;
	return (
		<HoverCard
			closeDelay={CLOSE_DELAY_MS}
			onOpenChange={setOpen}
			open={open}
			openDelay={OPEN_DELAY_MS}
		>
			<HoverCardTrigger asChild>
				<a
					className="mx-px inline-flex max-w-full items-center rounded-md align-middle text-foreground/70 no-underline outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
					href={url}
					onClick={(event) => {
						setOpen(false);
						if (openLink?.(url, event)) event.preventDefault();
					}}
					rel="noreferrer"
					target="_blank"
					title={url}
				>
					<span
						className={cn(
							"inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-[6px] px-1.5 font-medium text-xs leading-4",
							pr
								? "bg-violet-400/10 text-violet-400/90"
								: "bg-emerald-400/10 text-emerald-400/90",
						)}
					>
						<Icon aria-hidden="true" className="size-3" />
						{label}
					</span>
				</a>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				side="top"
				sideOffset={6}
			>
				<GithubWorkItemCard link={link} load={load} />
			</HoverCardContent>
		</HoverCard>
	);
}
