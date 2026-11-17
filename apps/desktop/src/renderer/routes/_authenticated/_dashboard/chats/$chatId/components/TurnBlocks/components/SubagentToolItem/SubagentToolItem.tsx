import type { ChatState } from "@superset/chats-core";
import {
	type LiveTurn,
	type LiveTurns,
	subagentsLabel,
	type ToolBlock,
} from "@superset/chats-sync";
import { LuWorkflow } from "react-icons/lu";
import { SubagentRunItem } from "../SubagentRunItem";
import { ToolStatusIcon } from "../ToolStatusIcon";

interface SubagentToolItemProps {
	state: ChatState;
	live: LiveTurns;
	parent: LiveTurn;
	tool: ToolBlock;
}

/** The helpers a Dev started in one call, each with what it did. */
export function SubagentToolItem({
	state,
	live,
	parent,
	tool,
}: SubagentToolItemProps) {
	return (
		<div className="my-1 flex flex-col gap-1.5">
			<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
				<LuWorkflow className="size-3.5 shrink-0" />
				<span>{subagentsLabel(tool)}</span>
				<ToolStatusIcon tool={tool} />
			</div>
			<div className="ml-[7px] flex flex-col gap-2 border-border border-l-2 pl-3">
				{(tool.subagents ?? []).map((run) => (
					<SubagentRunItem
						key={run.id}
						state={state}
						live={live}
						parent={parent}
						run={run}
					/>
				))}
				{tool.status === "failed" && (
					<p className="text-destructive text-xs">{tool.output}</p>
				)}
			</div>
		</div>
	);
}
