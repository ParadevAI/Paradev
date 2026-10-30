import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface RepositoryListErrorProps {
	message: string;
	onRetry: () => void;
}

export function RepositoryListError({
	message,
	onRetry,
}: RepositoryListErrorProps) {
	return (
		<div className="flex items-center justify-between gap-2 border-t px-3 py-2">
			<span className="min-w-0 truncate text-xs text-destructive">
				{message}
			</span>
			<Button onClick={onRetry} size="sm" variant="ghost">
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
}
