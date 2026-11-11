import { Trans, useLingui } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import type { PullRequestMergeFlow } from "../../../../hooks/usePullRequestMergeFlow";

export function PullRequestDequeueDialog({
	flow,
	prNumber,
}: {
	flow: PullRequestMergeFlow;
	prNumber: number;
}) {
	const { t } = useLingui();
	const stack = flow.isStack ? flow.stack : null;
	const queuedAbove =
		stack?.layers.filter(
			(layer) => layer.position > stack.currentPosition && layer.queue !== null,
		) ?? [];

	return (
		<AlertDialog
			open={flow.confirmsDequeue}
			onOpenChange={(open) => {
				if (!open) flow.cancelDequeue();
			}}
		>
			<EnterEnabledAlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pb-2 pt-4">
					<AlertDialogTitle className="font-medium">
						{t({ message: `Remove #${prNumber} from the merge queue?` })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{queuedAbove.length > 0 ? (
							<Trans>
								The stacked pull requests above it leave the queue too. Each
								must join again and pass its checks.
							</Trans>
						) : (
							<Trans>It must join again and pass its checks to merge.</Trans>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{queuedAbove.length > 0 ? (
					<ol className="mx-4 mb-1 mt-1 max-h-40 overflow-y-auto rounded-md border border-border/60 py-1 text-xs">
						{queuedAbove.map((layer) => (
							<li
								key={layer.number}
								className="flex min-w-0 items-baseline gap-2 px-2.5 py-1"
							>
								<span className="shrink-0 tabular-nums text-muted-foreground">
									#{layer.number}
								</span>
								<span className="min-w-0 truncate text-foreground/90">
									{layer.title}
								</span>
							</li>
						))}
					</ol>
				) : null}
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={flow.cancelDequeue}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={flow.runDequeue}
					>
						<Trans>Remove from queue</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
