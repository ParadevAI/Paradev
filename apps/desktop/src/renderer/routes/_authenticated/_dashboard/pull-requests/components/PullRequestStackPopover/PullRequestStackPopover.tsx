import { useLingui } from "@lingui/react/macro";
import { badgeVariants } from "@superset/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "../../hooks/usePullRequestStack";
import { usePullRequestStackCopy } from "../../hooks/usePullRequestStackCopy";
import { assessPullRequestStack } from "../../utils/assessPullRequestStack";
import { PullRequestStackBaseRow } from "./components/PullRequestStackBaseRow";
import { PullRequestStackLayerRow } from "./components/PullRequestStackLayerRow";
import { PullRequestStackPosition } from "./components/PullRequestStackPosition";
import { PullRequestStackVerdict } from "./components/PullRequestStackVerdict";

const TRIGGER_CLASS_NAME = {
	badge: cn(
		badgeVariants({ variant: "outline" }),
		"h-7 gap-1.5 border-border/60 px-2.5 font-normal text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-foreground",
	),
	segment:
		"flex h-full items-center gap-1 px-1.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground",
};

/**
 * The stack chip ("2/4") and the navigator it opens: one verdict for what a
 * merge here would land, then every layer top to bottom on a rail that ends
 * at the base branch.
 */
export function PullRequestStackPopover({
	stack,
	appearance,
	className,
	workspaceNumber = null,
	viewingNumber = null,
	onSelectLayer,
}: {
	stack: PullRequestStack;
	/** `badge` stands alone; `segment` is one part of a bordered split button. */
	appearance: "badge" | "segment";
	className?: string;
	/** The PR of the workspace this chip sits in. */
	workspaceNumber?: number | null;
	/** The PR open in the pane, when it is another layer than the workspace's. */
	viewingNumber?: number | null;
	onSelectLayer: (layer: PullRequestStackLayer) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const copy = usePullRequestStackCopy();
	const { verdict } = assessPullRequestStack(stack);
	const layersTopDown = [...stack.layers].reverse();

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
				/>
				<div className="max-h-[min(28rem,70vh)] overflow-y-auto py-1.5">
					{layersTopDown.map((layer) => (
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
							onSelect={(selected) => {
								setOpen(false);
								if (!selected.isCurrent) onSelectLayer(selected);
							}}
						/>
					))}
					<PullRequestStackBaseRow baseRefName={stack.baseRefName} />
				</div>
			</PopoverContent>
		</Popover>
	);
}
