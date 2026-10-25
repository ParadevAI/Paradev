import { Trans, useLingui } from "@lingui/react/macro";
import { formatElapsed } from "@superset/i18n/format";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Bot, Square, SquareTerminal } from "lucide-react";
import type { MouseEvent } from "react";

const LABEL_SWEEP_SECONDS = 1.6;

const ACTION_CLASSNAME =
	"flex h-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function RunningRow({
	rowKey,
	tabbable,
	kind,
	name,
	step,
	runningSubagents = 0,
	needsApproval = false,
	startedAtMs,
	now,
	onOpen,
	onStop,
	onMoveToBackground,
}: {
	rowKey: string;
	tabbable: boolean;
	kind: "subagent" | "shell";
	name: string;
	step?: string;
	runningSubagents?: number;
	needsApproval?: boolean;
	startedAtMs: number;
	now: number;
	onOpen?: () => void;
	onStop?: () => void;
	onMoveToBackground?: () => void;
}) {
	const { t } = useLingui();
	const elapsed = formatElapsed(startedAtMs, now);
	const label = [
		name,
		step,
		needsApproval ? t({ message: "needs approval" }) : undefined,
		elapsed,
	]
		.filter(Boolean)
		.join(", ");
	const Icon = kind === "subagent" ? Bot : SquareTerminal;
	const action = (run: () => void) => (event: MouseEvent) => {
		event.stopPropagation();
		run();
	};
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: the drawer's listbox handles Enter for every row
		<div
			aria-label={label}
			aria-selected={tabbable}
			className={cn(
				"group flex min-h-7 items-center gap-1 rounded-md pr-1 pl-2.5 font-sans text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring",
				onOpen && "cursor-pointer",
			)}
			data-drawer-stop={rowKey}
			onClick={onOpen}
			role="option"
			tabIndex={tabbable ? 0 : -1}
		>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span
					className={cn(
						"min-w-0 shrink truncate text-foreground/80",
						kind === "shell" && "font-mono text-xs",
					)}
				>
					{kind === "subagent" ? (
						<ShimmerLabel
							className="font-normal"
							duration={LABEL_SWEEP_SECONDS}
						>
							{name}
						</ShimmerLabel>
					) : (
						name
					)}
				</span>
				{runningSubagents > 0 && (
					<span className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 text-[11px] text-muted-foreground tabular-nums leading-4">
						+{runningSubagents}
					</span>
				)}
				{step && (
					<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
						{step}
					</span>
				)}
			</span>
			{needsApproval && (
				<span className="shrink-0 text-warning text-xs">
					<Trans>needs approval</Trans>
				</span>
			)}
			<span className="shrink-0 text-muted-foreground/70 text-xs tabular-nums">
				{elapsed}
			</span>
			<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
				{onMoveToBackground && (
					<button
						aria-label={t({ message: `Move ${name} to background` })}
						className={cn(ACTION_CLASSNAME, "px-1.5 text-xs")}
						onClick={action(onMoveToBackground)}
						type="button"
					>
						<Trans>Move to background</Trans>
					</button>
				)}
				{onStop && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								aria-label={t({ message: `Stop ${name}` })}
								className={cn(ACTION_CLASSNAME, "w-6")}
								onClick={action(onStop)}
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
		</div>
	);
}
