import { Trans } from "@lingui/react/macro";
import type { ChatState } from "@superset/chats-core";
import {
	type LiveTurn,
	type LiveTurns,
	runActive,
	runMetaText,
	type SubagentRun,
} from "@superset/chats-sync";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { useState } from "react";
import {
	LuBot,
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuCircleSlash,
	LuLoaderCircle,
	LuTriangleAlert,
} from "react-icons/lu";
import { TurnBlocks } from "../../TurnBlocks";

interface SubagentRunItemProps {
	state: ChatState;
	live: LiveTurns;
	/** The turn that started it, whose chat its text renders in. */
	parent: LiveTurn;
	run: SubagentRun;
}

/** One helper a Dev started: its kind, task and status, and what it did. */
export function SubagentRunItem({
	state,
	live,
	parent,
	run,
}: SubagentRunItemProps) {
	const [open, setOpen] = useState(true);
	const meta = runMetaText(run);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="flex flex-col gap-1"
		>
			<CollapsibleTrigger className="group/run -ml-1.5 flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-fill-hover">
				<LuBot className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="font-medium capitalize">
					{run.step ? `${run.step}. ${run.agent}` : run.agent}
				</span>
				{runActive(run) ? (
					<LuLoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
				) : run.status === "completed" ? (
					<LuCheck className="size-3 shrink-0 text-muted-foreground" />
				) : run.status === "failed" ? (
					<LuTriangleAlert className="size-3 shrink-0 text-destructive" />
				) : (
					<LuCircleSlash className="size-3 shrink-0 text-muted-foreground" />
				)}
				{meta && (
					<span className="min-w-0 truncate text-muted-foreground text-xs tabular-nums">
						{meta}
					</span>
				)}
				<span className="ml-auto hidden shrink-0 text-muted-foreground group-hover/run:inline-flex">
					{open ? (
						<LuChevronDown className="size-3.5" />
					) : (
						<LuChevronRight className="size-3.5" />
					)}
				</span>
			</CollapsibleTrigger>
			<p className="line-clamp-2 pl-[22px] text-muted-foreground text-xs leading-relaxed">
				{run.task}
			</p>
			<CollapsibleContent>
				<div className="mt-1 ml-[7px] flex flex-col gap-1 border-border border-l-2 pl-3">
					{run.blocks.length > 0 && (
						<TurnBlocks
							state={state}
							live={live}
							turn={{
								...parent,
								stream: { inTurn: true, blocks: run.blocks },
							}}
						/>
					)}
					{run.status === "pending" && (
						<p className="text-muted-foreground text-xs">
							<Trans>Waiting for a free slot…</Trans>
						</p>
					)}
					{run.status === "cancelled" && (
						<p className="text-muted-foreground text-xs">
							<Trans>Stopped.</Trans>
						</p>
					)}
					{run.error && <p className="text-destructive text-xs">{run.error}</p>}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
