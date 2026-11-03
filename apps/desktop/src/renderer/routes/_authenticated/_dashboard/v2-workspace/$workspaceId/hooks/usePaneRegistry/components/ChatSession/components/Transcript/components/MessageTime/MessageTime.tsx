import { useFormat } from "@superset/i18n/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

function labelOptions(at: Date, now: Date): Intl.DateTimeFormatOptions {
	if (at.toDateString() === now.toDateString()) {
		return { hour: "numeric", minute: "2-digit" };
	}
	return {
		month: "short",
		day: "numeric",
		...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
	};
}

export function MessageTime({ atMs }: { atMs: number }) {
	const { formatDateTime } = useFormat();
	const at = new Date(atMs);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<time className="text-[11px] tabular-nums" dateTime={at.toISOString()}>
					{formatDateTime(at, labelOptions(at, new Date()))}
				</time>
			</TooltipTrigger>
			<TooltipContent>{formatDateTime(at)}</TooltipContent>
		</Tooltip>
	);
}
