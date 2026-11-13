import { useLingui } from "@lingui/react/macro";
import { badgeVariants } from "@superset/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import type { PullRequestMergeFlow } from "../../hooks/usePullRequestMergeFlow";
import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "../../hooks/usePullRequestStack";
import { usePullRequestStackCopy } from "../../hooks/usePullRequestStackCopy";
import type { StackRestackAction } from "../../hooks/useStackRestack";
import {
	type StackLayerIssue,
	stackLayerIssue,
} from "../../utils/assessPullRequestStack";
import { PullRequestStackPosition } from "../PullRequestStackPosition";
import { PullRequestStackBaseRow } from "./components/PullRequestStackBaseRow";
import { PullRequestStackCallout } from "./components/PullRequestStackCallout";
import {
	PullRequestStackLayerRow,
	type StackLayerStatusTone,
} from "./components/PullRequestStackLayerRow";
import { PullRequestStackVerdict } from "./components/PullRequestStackVerdict";

const TRIGGER_CLASS_NAME = {
	badge: cn(
		badgeVariants({ variant: "outline" }),
		"h-7 gap-1.5 border-border/60 px-2.5 font-normal text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
	),
	segment:
		"flex h-full items-center gap-1 px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground",
};

const ISSUE_TONE: Record<StackLayerIssue, StackLayerStatusTone> = {
	closed: "danger",
	draft: "muted",
	conflicts: "danger",
	changes_requested: "danger",
	review_required: "muted",
	blocked: "muted",
	checks_failing: "warning",
	behind: "muted",
	pending: "muted",
};

function layerStatusTone(layer: PullRequestStackLayer): StackLayerStatusTone {
	if (layer.queue) return "warning";
	const issue = stackLayerIssue(layer);
	return issue ? ISSUE_TONE[issue] : "muted";
}

export function PullRequestStackPopover({
	stack,
	flow,
	appearance,
	className,
	workspaceNumber = null,
	viewingNumber = null,
	restack = null,
	onSelectLayer,
}: {
	stack: PullRequestStack;
	flow: PullRequestMergeFlow;
	/** `badge` stands alone; `segment` is one part of a bordered split button. */
	appearance: "badge" | "segment";
	className?: string;
	/** The PR of the workspace this chip sits in. */
	workspaceNumber?: number | null;
	/** The PR open in the pane, when it is another layer than the workspace's. */
	viewingNumber?: number | null;
	restack?: StackRestackAction | null;
	onSelectLayer: (layer: PullRequestStackLayer) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const copy = usePullRequestStackCopy();
	const verdict = flow.assessment?.verdict ?? "pending";
	const canCreateStack = flow.chain.length >= 2;
	const reason = flow.blocker ? copy.blocker(flow.blocker) : null;
	const layersTopDown = [...stack.layers].reverse();
	const mergedNumber = restack?.mergedNumber;
	const run = restack?.run ?? null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={copy.openLabel(stack)}
							className={cn(TRIGGER_CLASS_NAME[appearance], className)}
						>
							<PullRequestStackPosition
								position={stack.currentPosition}
								size={stack.layers.length}
							/>
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">{copy.position(stack)}</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-[min(24rem,calc(100vw-1rem))] p-0"
			>
				<PullRequestStackVerdict
					verdict={verdict}
					label={copy.verdict(verdict)}
					summary={copy.summary(stack)}
					reason={reason}
				/>
				{restack ? (
					<PullRequestStackCallout
						text={t({
							message: `#${mergedNumber} merged, and this branch still carries its commits.`,
						})}
						tone="warning"
						action={
							run
								? {
										label: t({ message: "Restack" }),
										run: () => {
											setOpen(false);
											run();
										},
										isPending: restack.isPending,
									}
								: null
						}
					/>
				) : null}
				{canCreateStack ? (
					<PullRequestStackCallout
						text={t({
							message:
								"These are linked by base branch, so each merges into the one below it. A GitHub stack merges them in one step.",
						})}
						action={{
							label: t({ message: "Create stack" }),
							run: flow.createStack,
							isPending: flow.isCreatingStack,
						}}
					/>
				) : null}
				<div className="max-h-[min(28rem,70vh)] overflow-y-auto py-1.5">
					{layersTopDown.map((layer) => {
						const label = copy.layerStatus(layer);
						return (
							<PullRequestStackLayerRow
								key={layer.number}
								layer={layer}
								tag={
									layer.number === workspaceNumber
										? t({ message: "This workspace" })
										: layer.number === viewingNumber
											? t({ message: "Viewing", context: "stack layer" })
											: null
								}
								status={label ? { label, tone: layerStatusTone(layer) } : null}
								onSelect={(selected) => {
									setOpen(false);
									if (!selected.isCurrent) onSelectLayer(selected);
								}}
							/>
						);
					})}
					<PullRequestStackBaseRow baseRefName={stack.baseRefName} />
				</div>
			</PopoverContent>
		</Popover>
	);
}
