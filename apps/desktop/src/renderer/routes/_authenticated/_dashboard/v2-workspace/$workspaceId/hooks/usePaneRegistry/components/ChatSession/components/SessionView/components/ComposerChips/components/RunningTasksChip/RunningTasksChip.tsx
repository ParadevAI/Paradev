import { Trans, useLingui } from "@lingui/react/macro";
import type { BackgroundTask } from "@superset/chat/protocol";
import { formatAge } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Bot, Square, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { COMPOSER_CHIP_CLASSNAME } from "../../constants";

export function RunningTasksChip({
	kind,
	tasks,
	onOpen,
	onStop,
}: {
	kind: BackgroundTask["kind"];
	tasks: readonly BackgroundTask[];
	onOpen?: (taskId: string) => void;
	onStop: (taskId: string) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const now = useNow().getTime();
	const count = tasks.length;
	const Icon = kind === "subagent" ? Bot : SquareTerminal;
	const fallbackName =
		kind === "subagent"
			? t({ message: "Subagent" })
			: t({ message: "Terminal" });
	const oldestStartedAtMs = Math.min(...tasks.map((task) => task.startedAtMs));
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button className={COMPOSER_CHIP_CLASSNAME} type="button">
					<Icon
						className={cn(
							"size-3 shrink-0 animate-pulse",
							kind === "subagent" ? "text-sky-500" : "text-amber-500",
						)}
					/>
					<span className="truncate">
						{kind === "subagent"
							? t({ message: `Subagents · ${count}` })
							: t({ message: `Background · ${count}` })}
					</span>
					<span className="shrink-0 font-mono tabular-nums">
						{formatAge(oldestStartedAtMs, now)}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-1" side="top">
				{tasks.map((task) => {
					const name = task.name || fallbackName;
					return (
						<div
							className="group flex min-h-7 items-center gap-1 rounded-sm py-0.5 pr-1 pl-2 text-xs transition-colors hover:bg-accent"
							key={task.id}
						>
							<button
								className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"
								disabled={!onOpen}
								onClick={() => {
									setOpen(false);
									onOpen?.(task.id);
								}}
								type="button"
							>
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span
										className={cn(
											"min-w-0 truncate text-foreground",
											kind === "process" && "font-mono",
										)}
									>
										{name}
									</span>
									{task.detail && (
										<span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
											{task.detail}
										</span>
									)}
								</span>
								<span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
									{formatAge(task.startedAtMs, now)}
								</span>
							</button>
							{task.canStop && (
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											aria-label={t({ message: `Stop ${name}` })}
											className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background"
											onClick={() => onStop(task.id)}
											type="button"
										>
											<Square className="size-2.5 fill-current" />
										</button>
									</TooltipTrigger>
									<TooltipContent side="top">
										<Trans>Stop</Trans>
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
