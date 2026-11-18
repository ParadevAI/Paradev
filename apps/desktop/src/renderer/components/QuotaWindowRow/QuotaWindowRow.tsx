import { cn } from "@superset/ui/utils";
import type { UsageQuotaWindow } from "renderer/hooks/host-service/useHostUsageQuota";
import { useNow } from "renderer/hooks/useNow";
import {
	formatResetIn,
	formatResetLabel,
} from "renderer/utils/usage/formatResetIn";
import {
	QUOTA_METER_FILL_CLASS,
	quotaMeterTone,
} from "renderer/utils/usage/quotaMeterTone";

export function QuotaWindowRow({
	window,
	className,
}: {
	window: UsageQuotaWindow;
	className?: string;
}) {
	const now = useNow(60_000);
	const percent = Math.min(window.usedPercent, 100);
	return (
		<div
			className={cn(
				"grid grid-cols-[minmax(0,9rem)_1fr_2.5rem_5rem] items-center gap-2",
				className,
			)}
		>
			<span className="truncate text-[11px] text-muted-foreground">
				{window.label}
			</span>
			<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={cn(
						"h-full rounded-full",
						QUOTA_METER_FILL_CLASS[quotaMeterTone(window.usedPercent)],
					)}
					style={{ width: `${Math.max(percent, 1)}%` }}
				/>
			</div>
			<span className="text-right text-[11px] tabular-nums">
				{window.usedPercent}%
			</span>
			<span
				className="text-right text-[11px] text-muted-foreground tabular-nums"
				title={
					window.resetsAt ? formatResetLabel(window.resetsAt, now) : undefined
				}
			>
				{window.resetsAt ? `↺ ${formatResetIn(window.resetsAt, now)}` : ""}
			</span>
		</div>
	);
}
