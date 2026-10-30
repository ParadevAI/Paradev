import { Trans } from "@lingui/react/macro";

interface RepositoryListEmptyProps {
	isLoading: boolean;
	isLoadingMore: boolean;
}

export function RepositoryListEmpty({
	isLoading,
	isLoadingMore,
}: RepositoryListEmptyProps) {
	if (isLoading || isLoadingMore) {
		return <Trans>Loading repositories...</Trans>;
	}
	return <Trans>No matches</Trans>;
}
