import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { GithubCommitView } from "../../types";

interface GithubCommitListProps {
	commits: GithubCommitView[];
	/** How many commits there are in all, when more than are listed. */
	total: number;
}

/** Commits as GitHub lists them: the first line, who wrote it, and the short sha. */
export function GithubCommitList({ commits, total }: GithubCommitListProps) {
	const { t } = useLingui();
	const more = total - commits.length;
	if (commits.length === 0) return null;
	return (
		<ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border text-xs">
			{commits.map((commit) => (
				<li
					key={commit.sha}
					className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
				>
					<span className="min-w-0 flex-1 truncate text-foreground">
						{commit.message}
					</span>
					{commit.author && (
						<span className="shrink-0 text-muted-foreground">
							{commit.author}
						</span>
					)}
					<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
						{commit.sha.slice(0, 7)}
					</span>
				</li>
			))}
			{more > 0 && (
				<li className="px-3 py-1.5 text-muted-foreground">
					{t({
						message: plural(more, {
							one: "and # more",
							other: "and # more",
						}),
					})}
				</li>
			)}
		</ul>
	);
}
