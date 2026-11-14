import { Trans } from "@lingui/react/macro";
import { LuFolderGit2 } from "react-icons/lu";

interface FailedRepositoryRowsProps {
	repositories: Array<{ repositoryId: string; name: string }>;
}

/** One row for each repository whose changes failed to load. */
export function FailedRepositoryRows({
	repositories,
}: FailedRepositoryRowsProps) {
	if (repositories.length === 0) return null;
	return (
		<ul className="py-1">
			{repositories.map((repository) => (
				<li
					key={repository.repositoryId}
					className="flex items-center gap-1.5 py-1 pr-3 pl-2 text-xs"
				>
					<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
					<span className="min-w-0 truncate font-medium">
						{repository.name}
					</span>
					<span className="ml-auto shrink-0 text-destructive">
						<Trans>Unable to load git status</Trans>
					</span>
				</li>
			))}
		</ul>
	);
}
