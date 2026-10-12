import type { PullRequestDetailCommit } from "../../../../../../hooks/usePullRequestDetail";

interface PullRequestCommitLinkProps {
	commit: PullRequestDetailCommit;
}

/** A commit's subject with its short SHA at the right, opening the commit on GitHub. */
export function PullRequestCommitLink({ commit }: PullRequestCommitLinkProps) {
	return (
		<a
			href={commit.url}
			target="_blank"
			rel="noopener noreferrer"
			title={commit.messageHeadline}
			className="group flex h-5 w-full min-w-0 items-center gap-3 text-xs"
		>
			<span className="min-w-0 flex-1 truncate text-foreground/80 transition-colors group-hover:text-foreground">
				{commit.messageHeadline}
			</span>
			<span className="shrink-0 font-mono text-[11px] text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
				{commit.oid.slice(0, 7)}
			</span>
		</a>
	);
}
