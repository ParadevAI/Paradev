import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge, formatNumber } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { Bot, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { HotkeyLabel } from "renderer/hotkeys";
import { AgentWorkRow } from "../../../../../../../../../../components/AgentWorkRow";
import type { AgentWork } from "../../../../../../../../../../utils/collectAgentWork";
import { COMPOSER_CHIP_CLASSNAME } from "../../constants";

export function RunningTasksChip({
	kind,
	work,
	count = work.length,
	onOpen,
	onStop,
	onStopAll,
	onMoveToBackground,
}: {
	kind: AgentWork["kind"];
	work: readonly AgentWork[];
	count?: number;
	onOpen?: (taskId: string) => void;
	onStop: (taskId: string) => Promise<void>;
	onStopAll?: (() => void) | undefined;
	onMoveToBackground: (taskId: string) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
	const now = useNow().getTime();
	const subagentCount = count;
	const Icon = kind === "subagent" ? Bot : SquareTerminal;
	const label =
		kind === "subagent"
			? t({
					message: plural(subagentCount, {
						one: "# subagent running",
						other: "# subagents running",
					}),
				})
			: t({ message: `Background · ${count}` });
	const oldestStartedAtMs = Math.min(...work.map((item) => item.startedAtMs));
	const stop = ({ taskId }: AgentWork) => {
		setStopping((ids) => new Set(ids).add(taskId));
		void onStop(taskId).finally(() =>
			setStopping((ids) => {
				const next = new Set(ids);
				next.delete(taskId);
				return next;
			}),
		);
	};
	const openWork = ({ taskId }: AgentWork) => {
		if (!onOpen) return;
		setOpen(false);
		onOpen(taskId);
	};
	const canMove =
		kind === "subagent" && work.some((item) => item.canBackground);
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button className={COMPOSER_CHIP_CLASSNAME} title={label} type="button">
					<Icon
						className={cn(
							"size-3 shrink-0 animate-pulse",
							kind === "subagent" ? "text-sky-500" : "text-amber-500",
						)}
					/>
					<span className="hidden truncate @[28rem]:inline">{label}</span>
					<span aria-hidden="true" className="tabular-nums @[28rem]:hidden">
						{formatNumber(count)}
					</span>
					<span className="sr-only @[28rem]:hidden">{label}</span>
					<span className="shrink-0 text-muted-foreground/60 tabular-nums @max-[16rem]:hidden">
						{formatAge(oldestStartedAtMs, now)}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 p-1"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					if (event.currentTarget instanceof HTMLElement)
						event.currentTarget.focus();
				}}
				side="top"
			>
				{onStopAll && (
					<div className="flex min-h-7 items-center gap-2 px-2 text-muted-foreground text-xs">
						<span className="min-w-0 flex-1 truncate">{label}</span>
						<button
							className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
							onClick={() => {
								setOpen(false);
								onStopAll();
							}}
							type="button"
						>
							<Trans>Stop all</Trans>
						</button>
					</div>
				)}
				{work.map((item) => (
					<AgentWorkRow
						key={item.key}
						now={now}
						onMoveToBackground={({ taskId }) => onMoveToBackground(taskId)}
						onOpen={openWork}
						onStop={stop}
						pending={stopping.has(item.taskId)}
						work={item}
					/>
				))}
				{canMove && (
					<div className="flex min-h-6 items-center px-2 pt-1 text-[11px] text-muted-foreground/70">
						<HotkeyLabel
							id="MOVE_TO_BACKGROUND"
							label={t({ message: "Move to background" })}
						/>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
