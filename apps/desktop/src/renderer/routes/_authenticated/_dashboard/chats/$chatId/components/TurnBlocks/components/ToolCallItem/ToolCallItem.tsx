import { useLingui } from "@lingui/react/macro";
import {
	formatDuration,
	type ToolBlock,
	toolDuration,
	toolRunning,
} from "@superset/chats-sync";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import type { IconType } from "react-icons";
import {
	LuArrowRightLeft,
	LuBrain,
	LuChevronDown,
	LuChevronRight,
	LuFilePen,
	LuFileText,
	LuGlobe,
	LuSearch,
	LuSquareTerminal,
	LuTrash2,
	LuWrench,
} from "react-icons/lu";
import { ToolStatusIcon } from "../ToolStatusIcon";

const KIND_ICONS: Partial<Record<ToolBlock["toolKind"], IconType>> = {
	execute: LuSquareTerminal,
	read: LuFileText,
	edit: LuFilePen,
	delete: LuTrash2,
	move: LuArrowRightLeft,
	search: LuSearch,
	fetch: LuGlobe,
	think: LuBrain,
};

/** What a tool was called with: a shell command as itself, anything else as JSON. */
function inputText(input: unknown): string | null {
	if (input === null || input === undefined) return null;
	const command = (input as { command?: unknown }).command;
	if (typeof command === "string") return command;
	return JSON.stringify(input, null, 2);
}

/** One tool call: a quiet line that opens to what it was called with and what came back. */
export function ToolCallItem({ tool }: { tool: ToolBlock }) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const Icon = KIND_ICONS[tool.toolKind] ?? LuWrench;
	const running = toolRunning(tool);
	const input = open ? inputText(tool.input) : null;
	const took = toolDuration(tool);
	return (
		<Collapsible open={open} onOpenChange={setOpen} className="w-full">
			<CollapsibleTrigger className="group/tool -ml-1.5 flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-muted-foreground hover:bg-fill-hover hover:text-foreground">
				<Icon className="size-3.5 shrink-0" />
				<span className="min-w-0 truncate font-mono text-xs">{tool.title}</span>
				<ToolStatusIcon tool={tool} />
				{took !== null && (
					<span className="shrink-0 text-xs tabular-nums">
						{formatDuration(took)}
					</span>
				)}
				<span className="ml-auto hidden shrink-0 group-hover/tool:inline-flex">
					{open ? (
						<LuChevronDown className="size-3.5" />
					) : (
						<LuChevronRight className="size-3.5" />
					)}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{open && (
					<div className="mt-1 mb-1.5 flex flex-col divide-y divide-border rounded-xl bg-background/50 px-3">
						{input && (
							<div className="py-2.5">
								<p className="mb-1 font-medium text-muted-foreground text-xs">
									{t({
										message: "Input",
										context: "what a tool was called with",
									})}
								</p>
								<pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
									{input}
								</pre>
							</div>
						)}
						<div className="py-2.5">
							<p className="mb-1 font-medium text-muted-foreground text-xs">
								{t({ message: "Result", context: "what a tool returned" })}
							</p>
							<pre
								className={cn(
									"max-h-[200px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs",
									tool.status === "failed" && "text-destructive",
								)}
							>
								{running
									? t({ message: "Running…" })
									: tool.output || t({ message: "(no output)" })}
							</pre>
						</div>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
