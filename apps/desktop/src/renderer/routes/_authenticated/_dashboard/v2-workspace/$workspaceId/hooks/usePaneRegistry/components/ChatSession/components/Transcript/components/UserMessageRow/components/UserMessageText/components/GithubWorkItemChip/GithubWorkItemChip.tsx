import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { CircleDot, GitPullRequest } from "lucide-react";
import { useChatPaneActions } from "../../../../../../../../providers/ChatPaneActionsProvider";
import type { GithubWorkItemLink } from "../../../../../../../../utils/githubWorkItem";
import {
	GITHUB_WORK_ITEM_TONE_TEXT,
	githubWorkItemTone,
} from "../../../../../../../../utils/githubWorkItemTone";
import { GithubWorkItemHoverCard } from "../../../../../../../GithubWorkItemHoverCard";
import { LinkMenu } from "../../../../../../../LinkMenu";

/** A pull request or issue someone pasted, as a small chip in GitHub's colour for its state. */
export function GithubWorkItemChip({
	link,
	url,
}: {
	link: GithubWorkItemLink;
	url: string;
}) {
	const { t } = useLingui();
	const { openLink } = useChatPaneActions();
	const pr = link.kind === "pr";
	const { data: item } = workspaceTrpc.github.getWorkItem.useQuery(
		{
			owner: link.owner,
			repo: link.repo,
			kind: link.kind,
			number: link.number,
		},
		{ enabled: false },
	);
	const tone = githubWorkItemTone(link.kind, item ?? null);
	const label = pr
		? t({ message: `PR #${link.number}` })
		: t({ message: `Issue #${link.number}` });
	const Icon = pr ? GitPullRequest : CircleDot;
	return (
		<GithubWorkItemHoverCard link={link} url={url}>
			<LinkMenu href={url}>
				<a
					className="mx-px inline-flex max-w-full items-center rounded-md align-middle text-foreground/70 no-underline outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
					href={url}
					onClick={(event) => {
						if (openLink?.(url, event)) event.preventDefault();
					}}
					rel="noreferrer"
					target="_blank"
					title={url}
				>
					<span
						className={cn(
							"inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-[6px] px-1.5 font-medium text-xs leading-4",
							"bg-[color-mix(in_srgb,currentColor_12%,transparent)]",
							GITHUB_WORK_ITEM_TONE_TEXT[tone],
						)}
					>
						<Icon aria-hidden="true" className="size-3" />
						{label}
					</span>
				</a>
			</LinkMenu>
		</GithubWorkItemHoverCard>
	);
}
