import { cn } from "@superset/ui/utils";
import { useState } from "react";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import type { RepositoryShipSnapshot } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots";
import { RepositoryShipDetail } from "./components/RepositoryShipDetail";
import { RepositoryShipRow } from "./components/RepositoryShipRow";

interface RepositoryShipListProps {
	workspaceId: string;
	repositories: Array<{ repositoryId: string; name: string }>;
	snapshots: Record<string, RepositoryShipSnapshot>;
	onOpenPullRequest: OpenPullRequestPane;
}

/**
 * Every repository of a multi-repo workspace with its next ship step. A row
 * slides that repository's details in over the list.
 */
export function RepositoryShipList({
	workspaceId,
	repositories,
	snapshots,
	onOpenPullRequest,
}: RepositoryShipListProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [cameBack, setCameBack] = useState(false);
	const active = repositories.find(
		(repository) => repository.repositoryId === activeId,
	);
	const showRepositories = () => {
		setActiveId(null);
		setCameBack(true);
	};

	if (active) {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Escape goes back to the list
			<div
				key={active.repositoryId}
				className="animate-in fade-in-0 slide-in-from-right-8 duration-150"
				onKeyDown={(event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					showRepositories();
				}}
			>
				<RepositoryShipDetail
					workspaceId={workspaceId}
					repository={active}
					snapshot={snapshots[active.repositoryId]}
					onBack={showRepositories}
					onOpenPullRequest={onOpenPullRequest}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col gap-0.5 p-1",
				cameBack && "animate-in fade-in-0 slide-in-from-left-8 duration-150",
			)}
		>
			{repositories.map((repository) => (
				<RepositoryShipRow
					key={repository.repositoryId}
					workspaceId={workspaceId}
					repository={repository}
					snapshot={snapshots[repository.repositoryId]}
					onOpen={() => setActiveId(repository.repositoryId)}
					onOpenPullRequest={onOpenPullRequest}
				/>
			))}
		</div>
	);
}
