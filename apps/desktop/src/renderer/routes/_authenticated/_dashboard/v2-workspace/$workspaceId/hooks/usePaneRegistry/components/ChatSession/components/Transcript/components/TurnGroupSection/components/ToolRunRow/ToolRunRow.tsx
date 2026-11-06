import type {
	Item,
	Reasoning as ReasoningItem,
	ToolCall,
} from "@superset/chat/protocol";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { stepSummary } from "../../../../utils/stepSummary";
import { isNestedTool } from "../../../../utils/subagentLines";
import { toolKindIcon } from "../../../../utils/toolKindIcon";
import { NestedToolCallRow } from "../../../NestedToolCallRow";
import { ReasoningRow } from "../../../ReasoningRow";
import { ToolCallRow } from "../../../ToolCallRow";
import { RailStep } from "../RailStep";
import { dominantKind } from "./utils/dominantKind";

const SUMMARY_SWEEP_SECONDS = 1.6;

type ToolRunRowProps = {
	rowKey: string;
	items: ToolCall[];
	steps: readonly Item[];
	/** Each step's thinking text, "" for a tool call. */
	stepTexts: readonly string[];
	childLists?: readonly (readonly Item[] | undefined)[] | undefined;
	collapsed: boolean;
	active?: boolean;
	onToggle: (rowKey: string, collapsed: boolean) => void;
};

const ACTIVE_TAIL_STEPS = 3;

function sameChildLists(
	previous: ToolRunRowProps["childLists"],
	next: ToolRunRowProps["childLists"],
): boolean {
	if (previous === next) return true;
	if (!previous || !next || previous.length !== next.length) return false;
	return previous.every((list, index) => list === next[index]);
}

function sameTools(previous: ToolRunRowProps, next: ToolRunRowProps): boolean {
	return (
		previous.rowKey === next.rowKey &&
		previous.collapsed === next.collapsed &&
		previous.active === next.active &&
		previous.onToggle === next.onToggle &&
		previous.steps.length === next.steps.length &&
		previous.steps.every((step, index) => step === next.steps[index]) &&
		previous.stepTexts.every((text, index) => text === next.stepTexts[index]) &&
		sameChildLists(previous.childLists, next.childLists)
	);
}

export const ToolRunRow = memo(function ToolRunRow({
	active = false,
	collapsed,
	items,
	onToggle,
	rowKey,
	steps,
	stepTexts,
	childLists,
}: ToolRunRowProps) {
	const done = items.filter((tool) => tool.status !== "running");
	const live = done.length === 0;
	const summary = stepSummary(live ? items : done);
	const tail =
		collapsed && active ? steps.slice(-ACTIVE_TAIL_STEPS) : undefined;
	const current =
		collapsed && !tail
			? items.find((tool) => tool.status === "running")
			: undefined;
	const renderStep = (step: Item) => (
		<RailStep key={step.id}>
			{step.kind === "reasoning" ? (
				<ReasoningRow
					item={step as ReasoningItem}
					text={stepTexts[steps.indexOf(step)] ?? ""}
				/>
			) : isNestedTool(
					step as ToolCall,
					childLists?.[items.indexOf(step as ToolCall)],
				) ? (
				<NestedToolCallRow item={step as ToolCall} />
			) : (
				<ToolCallRow item={step as ToolCall} />
			)}
		</RailStep>
	);
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
			{current && (
				<RailStep>
					<ToolCallRow item={current} />
				</RailStep>
			)}
			{tail?.map(renderStep)}
			<CollapsibleContent>{steps.map(renderStep)}</CollapsibleContent>
		</Collapsible>
	);
}, sameTools);
