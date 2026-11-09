import { Trans } from "@lingui/react/macro";
import type { MergeMethod } from "@superset/shared/pull-request-merge-methods";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ListChecks, ListX } from "lucide-react";
import type { PullRequestMergeFlow } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestMergeFlow";
import { usePullRequestStackCopy } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStackCopy";
import type { PullRequestTarget } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import { MergeMethodMenuItems } from "./components/MergeMethodMenuItems";

interface PullRequestMergeMenuSectionProps {
	target: PullRequestTarget | null;
	flow: PullRequestMergeFlow;
	isQueued: boolean;
	/** The caller's own merge of the one pull request is running. */
	isMergingAlone: boolean;
	/** Merges the one pull request when it is no stack and has no merge queue. */
	onMergeAlone: (method: MergeMethod) => void;
	className?: string;
	iconClassName?: string;
}

/**
 * A pull request menu's merge items: the repository's merge methods, the
 * whole stack with its count, the merge queue, or the way out of the queue.
 */
export function PullRequestMergeMenuSection({
	target,
	flow,
	isQueued,
	isMergingAlone,
	onMergeAlone,
	className,
	iconClassName,
}: PullRequestMergeMenuSectionProps) {
	const copy = usePullRequestStackCopy();

	if (isQueued) {
		return (
			<DropdownMenuItem
				className={className}
				disabled={flow.isDequeuing}
				onClick={flow.dequeue}
			>
				<ListX strokeWidth={1.75} className={iconClassName} />
				<Trans>Remove from queue</Trans>
			</DropdownMenuItem>
		);
	}

	const unavailable =
		isMergingAlone ||
		flow.isMerging ||
		flow.stackQuery.isLoading ||
		flow.blocker !== null;
	const countPill =
		flow.count !== null ? (
			<span className="rounded-full bg-foreground/10 px-1.5 text-[11px] leading-4 tabular-nums">
				{flow.count}
			</span>
		) : null;
	const blocker = flow.blocker ? (
		<p className="px-2 pb-1.5 text-xs text-muted-foreground">
			{copy.blocker(flow.blocker)}
		</p>
	) : null;

	if (flow.usesQueue) {
		return (
			<>
				<DropdownMenuItem
					className={className}
					disabled={unavailable}
					onClick={() => flow.request("squash")}
				>
					<ListChecks strokeWidth={1.75} className={iconClassName} />
					{flow.kind.stack ? (
						<Trans>Add stack to merge queue</Trans>
					) : (
						<Trans>Add to merge queue</Trans>
					)}
					{countPill ? <span className="ml-auto">{countPill}</span> : null}
				</DropdownMenuItem>
				{blocker}
			</>
		);
	}

	return (
		<>
			<DropdownMenuLabel
				className={cn("font-normal text-muted-foreground", className)}
			>
				<span className="flex items-center gap-1.5">
					{copy.action({ stack: flow.kind.stack, queue: false })}
					{countPill}
				</span>
			</DropdownMenuLabel>
			{blocker}
			<MergeMethodMenuItems
				target={target}
				isMerging={unavailable}
				onMerge={(method) =>
					flow.handlesMerge ? flow.request(method) : onMergeAlone(method)
				}
				className={className}
				iconClassName={iconClassName}
			/>
		</>
	);
}
