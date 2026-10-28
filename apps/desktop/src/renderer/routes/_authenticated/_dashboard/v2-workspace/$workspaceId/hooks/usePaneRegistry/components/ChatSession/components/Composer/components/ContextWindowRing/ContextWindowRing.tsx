import { Trans, useLingui } from "@lingui/react/macro";
import type { SessionUsage } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	type ContextWindowLevel,
	contextWindow,
} from "../../utils/contextWindow";

const LEVEL_CLASS: Record<ContextWindowLevel, string> = {
	normal: "text-muted-foreground",
	warning: "text-warning",
	critical: "text-destructive",
};

export type ContextWindowRingProps = {
	usage: SessionUsage;
	onCompact?: () => void;
	compactDisabled?: boolean;
};

export function ContextWindowRing({
	usage,
	onCompact,
	compactDisabled = false,
}: ContextWindowRingProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const meter = contextWindow(usage);
	const { percent, used, size, remaining, cost } = meter;
	const label = t({ message: `Context window: ${percent} used` });
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip open={open ? false : undefined}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={label}
							data-testid="context-window-ring"
							data-level={meter.level}
							className={cn(
								"flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.07]",
								LEVEL_CLASS[meter.level],
							)}
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 20 20"
								className="size-[18px] -rotate-90"
								fill="none"
							>
								<circle
									cx="10"
									cy="10"
									r="8"
									stroke="currentColor"
									strokeWidth="2"
									opacity={0.25}
								/>
								{meter.usedPercent > 0 && (
									<circle
										cx="10"
										cy="10"
										r="8"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										pathLength={100}
										strokeDasharray={100}
										strokeDashoffset={100 - meter.usedPercent}
										className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
									/>
								)}
							</svg>
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">{label}</TooltipContent>
			</Tooltip>
			<PopoverContent
				side="top"
				align="end"
				className="w-64 max-w-[calc(100vw-24px)] p-3"
				aria-label={t({ message: "Context window" })}
			>
				<p className="text-muted-foreground text-xs">
					<Trans>Context window</Trans>
				</p>
				<p className="mt-1 font-medium text-sm tabular-nums">
					<Trans>{percent} used</Trans>
				</p>
				<p className="mt-0.5 text-xs tabular-nums">
					<Trans>
						{used} of {size} tokens
					</Trans>
				</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					<Trans>{remaining} tokens left</Trans>
				</p>
				{cost && (
					<p className="mt-2 text-muted-foreground text-xs tabular-nums">
						<Trans>Session cost: {cost}</Trans>
					</p>
				)}
				{onCompact && (
					<div className="mt-3 border-t pt-3">
						<Button
							type="button"
							variant="outline"
							size="xs"
							disabled={compactDisabled}
							onClick={() => {
								setOpen(false);
								onCompact();
							}}
						>
							<Trans>Compact now</Trans>
						</Button>
						<p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
							{compactDisabled ? (
								<Trans>Available when the agent is idle.</Trans>
							) : (
								<Trans>Summarizes the chat to free up context.</Trans>
							)}
						</p>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
