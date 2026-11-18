import { useLingui } from "@lingui/react/macro";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

/**
 * The connection status pill floating over the top of its positioned parent,
 * so it neither shifts the panes nor hides at the bottom edge. The full
 * explanation is in the tooltip.
 */
export function ConnectionPill({
	label,
	detail,
	title,
	dialing,
	denied = false,
	trailing,
	actions,
	onRetry,
	className,
}: {
	label: string;
	detail: string;
	title?: string;
	dialing: boolean;
	denied?: boolean;
	trailing?: ReactNode;
	actions?: ReactNode;
	onRetry: () => void;
	className?: string;
}) {
	const { t } = useLingui();
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4",
				className ?? "top-32",
			)}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						aria-live="polite"
						className={cn(
							"pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg",
							denied ? "border-destructive/40" : "border-border",
						)}
					>
						{dialing ? (
							<WaveSpinner className="text-amber-500" />
						) : (
							<span
								aria-hidden="true"
								className={cn(
									"size-1.5 shrink-0 rounded-full",
									denied ? "bg-destructive" : "bg-muted-foreground/60",
								)}
							/>
						)}
						<span className="truncate font-medium" title={title}>
							{label}
						</span>
						<span className="sr-only">{detail}</span>
						{trailing ? (
							<span className="shrink-0 text-muted-foreground tabular-nums">
								{trailing}
							</span>
						) : null}
						<span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
						{actions}
						<button
							type="button"
							onClick={onRetry}
							className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-medium hover:bg-accent/70"
						>
							{t({ message: "Retry" })}
						</button>
					</div>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="max-w-xs">
					{detail}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
