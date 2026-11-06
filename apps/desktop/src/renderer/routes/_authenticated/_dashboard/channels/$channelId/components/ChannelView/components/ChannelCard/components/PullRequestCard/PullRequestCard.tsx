import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	LuChevronRight,
	LuGitMerge,
	LuGitPullRequest,
	LuGitPullRequestClosed,
	LuGitPullRequestDraft,
} from "react-icons/lu";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

interface PullRequestCardProps {
	url: string;
	repoFullName: string;
	number: number;
	className?: string;
	/** Opens the agent whose workspace holds the pull request, or the URL when none does. */
	onOpen: (workspaceId: string | null) => void;
}

function stateIcon(state: V2WorkspacePrSummary["state"] | null) {
	switch (state) {
		case "merged":
			return <LuGitMerge className="size-4 text-purple-500" />;
		case "closed":
			return <LuGitPullRequestClosed className="size-4 text-red-500" />;
		case "draft":
			return <LuGitPullRequestDraft className="size-4 text-muted-foreground" />;
		default:
			return <LuGitPullRequest className="size-4 text-green-600" />;
	}
}

/**
 * A pull request an agent opened, drawn where the coordinator learned of it:
 * its number and title, and how its checks and review stand, from the board.
 */
export function PullRequestCard({
	url,
	repoFullName,
	number,
	className,
	onOpen,
}: PullRequestCardProps) {
	const { t } = useLingui();
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const ref = { repoFullName, number };
	const workspace = all.find((candidate) => {
		const candidateRef = candidate.pr
			? pullRequestRefFromUrl(candidate.pr.url)
			: null;
		return candidateRef !== null && isSamePullRequest(candidateRef, ref);
	});
	const pr = workspace?.pr ?? null;
	const facts = [
		repoFullName.split("/")[1] ?? repoFullName,
		pr?.state === "merged"
			? t({ message: "Merged" })
			: pr?.state === "closed"
				? t({ message: "Closed" })
				: pr?.state === "draft"
					? t({ message: "Draft" })
					: null,
		pr?.checksStatus === "success"
			? t({ message: "Checks passed" })
			: pr?.checksStatus === "failure"
				? t({ message: "Checks failed" })
				: pr?.checksStatus === "pending"
					? t({ message: "Checks running" })
					: null,
		pr?.reviewDecision === "approved"
			? t({ message: "Approved" })
			: pr?.reviewDecision === "changes_requested"
				? t({ message: "Changes requested" })
				: null,
	].filter(Boolean);
	return (
		<button
			type="button"
			onClick={() => onOpen(workspace?.id ?? null)}
			title={url}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-background py-2 pr-2 pl-2.5 text-left transition-colors hover:bg-fill-hover",
				className,
			)}
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-fill-hover">
				{stateIcon(pr?.state ?? null)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="flex min-w-0 items-baseline gap-1.5 text-[13px] leading-[18px]">
					<span className="shrink-0 text-muted-foreground tabular-nums">
						#{number}
					</span>
					<span className="truncate font-semibold">
						{pr?.title ?? <Trans>Pull request</Trans>}
					</span>
				</span>
				<span className="truncate text-[11px] leading-[14px] text-muted-foreground">
					{facts.join(" · ")}
				</span>
			</span>
			<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
		</button>
	);
}
