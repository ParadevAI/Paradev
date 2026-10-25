import { useLingui } from "@lingui/react/macro";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const WAKE_UP_ESTIMATE_SECONDS = 30;

interface HostConnectionPillProps {
	/** Null for a host with no settings page, like a cloud workspace's box. */
	settingsHostId: string | null;
	hostName: string;
	detail: string;
	isAccessDenied: boolean;
	/** The socket is retrying, including time spent in its native backoff. */
	isReconnecting: boolean;
	/** The socket has opened before, so this is a drop rather than a first dial. */
	hasConnected: boolean;
	/** The coordinator is restarting the local host service right now. */
	isLocalRestartInFlight: boolean;
	/** A cloud workspace is resuming from idle. */
	isWakingUp: boolean;
	onRetry: () => void;
}

/**
 * Nonmodal connection status floating over the top of the workspace, so it
 * neither shifts the panes nor hides at the bottom edge. The full explanation
 * is in the tooltip.
 */
export function HostConnectionPill({
	settingsHostId,
	hostName,
	detail,
	isAccessDenied,
	isReconnecting,
	hasConnected,
	isLocalRestartInFlight,
	isWakingUp,
	onRetry,
}: HostConnectionPillProps) {
	const { t } = useLingui();
	const isDialing =
		!isAccessDenied && (isReconnecting || isLocalRestartInFlight);
	const secondsLeft = useCountdown(isWakingUp ? WAKE_UP_ESTIMATE_SECONDS : 0);
	const label = isAccessDenied
		? t({ message: "Access denied" })
		: isLocalRestartInFlight
			? t({ message: "Restarting…" })
			: !isReconnecting
				? t({ message: "Disconnected" })
				: isWakingUp
					? secondsLeft > 0
						? t({ message: "Waking up workspace" })
						: t({ message: "Still waking up…" })
					: hasConnected
						? t({ message: "Reconnecting…" })
						: t({ message: "Connecting…" });

	return (
		<div className="pointer-events-none absolute inset-x-0 top-32 z-20 flex justify-center px-4">
			<Tooltip>
				<TooltipTrigger asChild>
					<div
						aria-live="polite"
						className={cn(
							"pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg",
							isAccessDenied ? "border-destructive/40" : "border-border",
						)}
					>
						{isDialing ? (
							<WaveSpinner className="text-amber-500" />
						) : (
							<span
								aria-hidden="true"
								className={cn(
									"size-1.5 shrink-0 rounded-full",
									isAccessDenied ? "bg-destructive" : "bg-muted-foreground/60",
								)}
							/>
						)}
						<span className="truncate font-medium" title={hostName}>
							{label}
						</span>
						<span className="sr-only">{detail}</span>
						{isWakingUp && secondsLeft > 0 ? (
							<span className="shrink-0 text-muted-foreground tabular-nums">
								{t({ message: `~${secondsLeft}s` })}
							</span>
						) : null}
						<span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
						{settingsHostId ? (
							<Link
								to="/settings/hosts/$hostId"
								params={{ hostId: settingsHostId }}
								className="shrink-0 rounded-full px-2.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								{t({ message: "Host settings" })}
							</Link>
						) : null}
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

function useCountdown(fromSeconds: number): number {
	const [secondsLeft, setSecondsLeft] = useState(fromSeconds);
	useEffect(() => {
		setSecondsLeft(fromSeconds);
		if (fromSeconds <= 0) return;
		const interval = setInterval(() => {
			setSecondsLeft((current) => Math.max(0, current - 1));
		}, 1000);
		return () => clearInterval(interval);
	}, [fromSeconds]);
	return secondsLeft;
}
