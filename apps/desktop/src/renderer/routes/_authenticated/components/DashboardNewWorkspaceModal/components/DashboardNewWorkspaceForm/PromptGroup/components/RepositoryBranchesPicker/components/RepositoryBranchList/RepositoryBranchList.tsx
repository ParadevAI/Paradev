import { useCallback, useState } from "react";
import {
	type BranchFilter,
	useBranchContext,
} from "../../../../../hooks/useBranchContext";
import { BranchCommand } from "../../../BranchCommand";
import { BranchLoadFailure } from "../../../BranchLoadFailure";

interface RepositoryBranchListProps {
	projectId: string;
	repositoryId: string;
	hostId: string | null;
	selectedBranch: string | null;
	onSelect: (branch: string) => void;
}

export function RepositoryBranchList({
	projectId,
	repositoryId,
	hostId,
	selectedBranch,
	onSelect,
}: RepositoryBranchListProps) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<BranchFilter>("all");
	const context = useBranchContext(projectId, hostId, search, filter, {
		repositoryId,
	});
	const { fetchNextPage, refetch } = context;
	const onLoadMore = useCallback(() => {
		void fetchNextPage();
	}, [fetchNextPage]);

	return (
		<BranchCommand
			branches={context.branches}
			defaultBranch={context.defaultBranch}
			selectedBranch={selectedBranch ?? context.defaultBranch}
			search={search}
			onSearchChange={setSearch}
			filter={filter}
			onFilterChange={setFilter}
			isLoading={context.isLoading}
			isError={context.isError}
			failure={
				<BranchLoadFailure
					error={context.error}
					isRetrying={context.isRefetching}
					onRetry={() => void refetch()}
				/>
			}
			hasNextPage={context.hasNextPage ?? false}
			isFetchingNextPage={context.isFetchingNextPage}
			onLoadMore={onLoadMore}
			onSelect={(branch) => onSelect(branch.name)}
		/>
	);
}
