import { LuExternalLink } from "react-icons/lu";
import { PullRequestStatusBadge } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceHoverCardContent/components/PullRequestStatusBadge";
import type { GithubPullView } from "../../types";
import { GithubAvatar } from "../GithubAvatar";

interface GithubPullHeaderProps {
	pull: GithubPullView;
}

/** The pull request a GitHub card is about: its state, title, author and branches, with the way to it. */
export function GithubPullHeader({ pull }: GithubPullHeaderProps) {
	return (
		<div className="flex flex-col gap-1.5 px-4 py-3">
			<div className="flex min-w-0 items-center gap-2 text-[13px]">
				<PullRequestStatusBadge
					state={pull.draft && pull.state === "open" ? "draft" : pull.state}
				/>
				<span className="min-w-0 truncate font-medium text-foreground">
					{pull.title}
				</span>
				<a
					href={pull.url}
					target="_blank"
					rel="noreferrer"
					className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
				>
					{pull.repo}#{pull.number}
					<LuExternalLink className="size-3 opacity-60" />
				</a>
			</div>
			<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{pull.author && (
					<span className="inline-flex items-center gap-1.5">
						<GithubAvatar
							name={pull.author.login}
							avatarUrl={pull.author.avatarUrl}
						/>
						{pull.author.login}
					</span>
				)}
				<span className="min-w-0 truncate font-mono text-[11.5px]">
					{pull.head} → {pull.base}
				</span>
			</div>
		</div>
	);
}
