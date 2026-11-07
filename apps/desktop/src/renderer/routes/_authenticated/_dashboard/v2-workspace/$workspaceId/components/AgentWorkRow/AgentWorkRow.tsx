import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Bot, Square, SquareTerminal } from "lucide-react";
import type { AgentWork } from "../../utils/collectAgentWork";

const ACTION_CLASSNAME =
	"flex h-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background disabled:pointer-events-none";

export function AgentWorkRow({
	work,
	source,
	now,
	pending = false,
	onOpen,
	onStop,
	onMoveToBackground,
}: {
	work: AgentWork;
	source?: string;
	now: number;
	pending?: boolean;
	onOpen: (work: AgentWork) => void;
	onStop: (work: AgentWork) => void;
	onMoveToBackground: (work: AgentWork) => void;
}) {
	const { t } = useLingui();
	const name =
		work.name ||
		(work.kind === "subagent"
			? t({ message: "Subagent" })
			: t({ message: "Terminal" }));
	const Icon = work.kind === "subagent" ? Bot : SquareTerminal;
	return (
		<div
			className={cn(
				"group flex min-h-7 items-center gap-1 rounded-sm py-0.5 pr-1 pl-2 text-xs transition-colors hover:bg-accent",
				pending && "opacity-50",
			)}
		>
			<button
				type="button"
				onClick={() => onOpen(work)}
				className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							className={cn(
								"min-w-0 truncate text-foreground",
								work.kind === "shell" && "font-mono",
							)}
						>
							{name}
						</span>
						{work.nested > 0 && (
							<span className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 text-[10px] text-muted-foreground tabular-nums leading-4">
								+{work.nested}
							</span>
						)}
					</span>
					{(source || work.step) && (
						<span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
							{[source, work.step].filter(Boolean).join(" · ")}
						</span>
					)}
				</span>
				<span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums group-hover:hidden">
					{formatAge(work.startedAtMs, now)}
				</span>
			</button>
			<div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
				{work.canBackground && (
					<button
						type="button"
						aria-label={t({ message: `Move ${name} to background` })}
						disabled={pending}
						onClick={() => onMoveToBackground(work)}
						className={cn(ACTION_CLASSNAME, "px-1.5 text-[11px]")}
					>
						<Trans>Move to background</Trans>
					</button>
				)}
				{work.canStop && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: `Stop ${name}` })}
								disabled={pending}
								onClick={() => onStop(work)}
								className={cn(ACTION_CLASSNAME, "w-6")}
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
		</div>
	);
}
