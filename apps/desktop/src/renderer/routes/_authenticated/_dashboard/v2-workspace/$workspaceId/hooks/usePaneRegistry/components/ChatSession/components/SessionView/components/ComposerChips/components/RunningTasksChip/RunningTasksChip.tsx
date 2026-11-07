import { useLingui } from "@lingui/react/macro";
import { formatAge, formatNumber } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { Bot, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { AgentWorkRow } from "../../../../../../../../../../components/AgentWorkRow";
import type { AgentWork } from "../../../../../../../../../../utils/collectAgentWork";
import { COMPOSER_CHIP_CLASSNAME } from "../../constants";

export function RunningTasksChip({
	kind,
	work,
	onOpen,
	onStop,
	onMoveToBackground,
}: {
	kind: AgentWork["kind"];
	work: readonly AgentWork[];
	onOpen?: (taskId: string) => void;
	onStop: (taskId: string) => Promise<void>;
	onMoveToBackground: (taskId: string) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
	const now = useNow().getTime();
	const count = work.length;
	const Icon = kind === "subagent" ? Bot : SquareTerminal;
	const label =
		kind === "subagent"
			? t({ message: `Subagents · ${count}` })
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
			</PopoverContent>
		</Popover>
	);
}
