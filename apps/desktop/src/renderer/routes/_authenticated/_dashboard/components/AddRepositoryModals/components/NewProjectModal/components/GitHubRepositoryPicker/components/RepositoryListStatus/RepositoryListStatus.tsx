import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface RepositoryListStatusProps {
	isLoading: boolean;
	isLoadingMore: boolean;
	error: Error | null;
	onRetry: () => void;
}

export function RepositoryListStatus({
	isLoading,
	isLoadingMore,
	error,
	onRetry,
}: RepositoryListStatusProps) {
	if (isLoading || isLoadingMore) {
		return (
			<div className="border-t px-3 py-2 text-xs text-muted-foreground">
				<Trans>Loading repositories...</Trans>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-between gap-2 border-t px-3 py-2">
				<span className="min-w-0 truncate text-xs text-destructive">
					{error.message}
				</span>
				<Button onClick={onRetry} size="sm" variant="ghost">
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	}

	return null;
}
