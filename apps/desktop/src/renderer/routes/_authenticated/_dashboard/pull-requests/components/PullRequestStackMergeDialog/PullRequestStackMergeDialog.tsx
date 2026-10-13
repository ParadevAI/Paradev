import { plural } from "@lingui/core/macro";
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
import type { PullRequestStack } from "../../hooks/usePullRequestStack";
import { stackMergeTargets } from "../../utils/assessPullRequestStack";

export type StackMergeMethod = "merge" | "squash" | "rebase";

/** Confirms a stack merge, naming how many PRs land and what stays open. */
export function PullRequestStackMergeDialog({
	open,
	onOpenChange,
	stack,
	prNumber,
	method,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stack: PullRequestStack;
	prNumber: number;
	method: StackMergeMethod;
	onConfirm: () => void;
}) {
	const { t } = useLingui();
	const count = stackMergeTargets(stack).length;
	const base = stack.baseRefName;
	const merges: Record<StackMergeMethod, string> = {
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
	const hasLayersAbove = stack.currentPosition < stack.layers.length;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[380px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pb-2 pt-4">
					<AlertDialogTitle className="font-medium">
						{t({
							message: plural(count, {
								one: "Merge # pull request?",
								other: "Merge # pull requests?",
							}),
						})}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{merges[method]}
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
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						<Trans>Merge stack</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
