import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";

export function HistoryNotice({
	failed,
	onRetry,
}: {
	failed: boolean;
	onRetry: () => void;
}) {
	return (
		<div className="flex shrink-0 justify-center px-4 pt-2">
			<output className="flex items-center gap-2 rounded-md border px-3 py-1 text-muted-foreground text-xs">
				{failed ? (
					<>
						<Trans>Couldn't load this chat's messages.</Trans>
						<Button
							className="h-6 px-2 text-xs"
							onClick={onRetry}
							size="sm"
							variant="ghost"
						>
							<Trans>Retry</Trans>
						</Button>
					</>
				) : (
					<>
						<Spinner className="size-3" />
						<Trans>Couldn't load this chat's messages. Retrying…</Trans>
					</>
				)}
			</output>
		</div>
	);
}
