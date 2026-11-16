import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MergeMethod } from "@superset/shared/pull-request-merge-methods";
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
import { useState } from "react";
import type { PullRequestMergeFlow } from "../../hooks/usePullRequestMergeFlow";
import { usePullRequestStackCopy } from "../../hooks/usePullRequestStackCopy";
import { PullRequestDequeueDialog } from "./components/PullRequestDequeueDialog";

export function PullRequestMergeFlowDialog({
	flow,
	prNumber,
}: {
	flow: PullRequestMergeFlow;
	prNumber: number;
}) {
	const { t } = useLingui();
	const copy = usePullRequestStackCopy();
	// The dialog keeps its text while it animates out, after `confirm` clears.
	const [method, setMethod] = useState<MergeMethod>("squash");
	if (flow.confirm && flow.confirm.method !== method) {
		setMethod(flow.confirm.method);
	}

	const { stack, isStack, usesQueue } = flow;
	const landsSeveral = flow.kind.stack;
	const count = flow.count ?? 1;
	const base = stack?.baseRefName ?? "";
	const mergeSeveral: Record<MergeMethod, string> = {
		squash: t({
			message: `This will atomically merge every open pull request through #${prNumber} into ${base} using squash.`,
		}),
		merge: t({
			message: `This will atomically merge every open pull request through #${prNumber} into ${base} using a merge commit.`,
		}),
		rebase: t({
			message: `This will atomically merge every open pull request through #${prNumber} into ${base} using rebase.`,
		}),
	};
	const mergeOne: Record<MergeMethod, string> = {
		squash: t({
			message: `This will merge #${prNumber} into ${base} using squash.`,
		}),
		merge: t({
			message: `This will merge #${prNumber} into ${base} using a merge commit.`,
		}),
		rebase: t({
			message: `This will merge #${prNumber} into ${base} using rebase.`,
		}),
	};
	const title = usesQueue
		? landsSeveral
			? t({
					message: plural(count, {
						one: "Add # pull request to the merge queue?",
						other: "Add # pull requests to the merge queue?",
					}),
				})
			: t({ message: `Add #${prNumber} to the merge queue?` })
		: landsSeveral
			? t({
					message: plural(count, {
						one: "Merge # pull request?",
						other: "Merge # pull requests?",
					}),
				})
			: t({ message: `Merge #${prNumber}?` });
	const description = usesQueue
		? landsSeveral
			? t({
					message: `Every open pull request through #${prNumber} joins the merge queue for ${base}, in order. GitHub merges them when their turn comes and their checks pass.`,
				})
			: t({
					message: "GitHub merges it when its turn comes and its checks pass.",
				})
		: landsSeveral
			? mergeSeveral[method]
			: mergeOne[method];
	const hasLayersAbove =
		isStack && stack !== null && stack.currentPosition < stack.layers.length;
	const landing = landsSeveral ? (flow.assessment?.targets ?? []) : [];

	return (
		<>
			<PullRequestDequeueDialog flow={flow} prNumber={prNumber} />
			<AlertDialog
				open={flow.confirm !== null}
				onOpenChange={(open) => {
					if (!open) flow.cancel();
				}}
			>
				<EnterEnabledAlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pb-2 pt-4">
						<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
						<AlertDialogDescription>
							{description}
							{hasLayersAbove ? (
								<>
									{" "}
									<Trans>
										Pull requests above it will remain open and GitHub will
										retarget them.
									</Trans>
								</>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{landing.length > 0 ? (
						<ol className="mx-4 mb-1 mt-1 max-h-40 overflow-y-auto rounded-md border border-border/60 py-1 text-xs">
							{landing.map((layer) => (
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
							onClick={flow.cancel}
						>
							<Trans>Cancel</Trans>
						</Button>
						<AlertDialogAction
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={flow.run}
						>
							{copy.action(flow.kind)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</EnterEnabledAlertDialogContent>
			</AlertDialog>
		</>
	);
}
