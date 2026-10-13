import type { ToolCall } from "@superset/chat/protocol";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { toolKindIcon } from "../../../../utils/toolKindIcon";
import { ToolCallRow } from "../../../ToolCallRow";
import { RailStep } from "../RailStep";
import { dominantKind } from "./utils/dominantKind";
import { stepSummary } from "./utils/stepSummary";

const SUMMARY_SWEEP_SECONDS = 1.6;

type ToolRunRowProps = {
	rowKey: string;
	items: ToolCall[];
	collapsed: boolean;
	onToggle: (rowKey: string, collapsed: boolean) => void;
};

function sameTools(previous: ToolRunRowProps, next: ToolRunRowProps): boolean {
	return (
		previous.rowKey === next.rowKey &&
		previous.collapsed === next.collapsed &&
		previous.onToggle === next.onToggle &&
		previous.items.length === next.items.length &&
		previous.items.every((item, index) => item === next.items[index])
	);
}

export const ToolRunRow = memo(function ToolRunRow({
	collapsed,
	items,
	onToggle,
	rowKey,
}: ToolRunRowProps) {
	const live = items.some((tool) => tool.status === "running");
	const summary = stepSummary(items);
	const Icon = toolKindIcon(dominantKind(items));
	return (
		<Collapsible
			onOpenChange={(open) => onToggle(rowKey, !open)}
			open={!collapsed}
		>
			<CollapsibleTrigger className="group/phase flex w-full min-w-0 items-center gap-1.5 py-1 text-left font-sans text-sm">
				<span className="relative flex size-3.5 shrink-0 items-center justify-center">
					<Icon className="size-3.5 text-foreground/45 transition-opacity group-hover/phase:opacity-0" />
					<ChevronRight
						className={cn(
							"absolute size-3.5 text-foreground/45 opacity-0 transition group-hover/phase:opacity-100",
							!collapsed && "rotate-90",
						)}
					/>
				</span>
				{live ? (
					<Shimmer
						className="min-w-0 truncate first-letter:uppercase"
						duration={SUMMARY_SWEEP_SECONDS}
						variant="text"
					>
						{summary}
					</Shimmer>
				) : (
					<span className="min-w-0 flex-1 truncate text-foreground/50 transition-colors duration-200 first-letter:uppercase group-hover/phase:text-foreground/80">
						{summary}
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				{items.map((tool) => (
					<RailStep key={tool.id}>
						<ToolCallRow item={tool} />
					</RailStep>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}, sameTools);
