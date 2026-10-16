import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { LuClock } from "react-icons/lu";

interface ScheduledNoticeProps {
	at: string;
}

/** Where the reply box was, once the reader scheduled the draft: when it goes out, as Gmail says it. */
export function ScheduledNotice({ at }: ScheduledNoticeProps) {
	const when = formatDate(new Date(at), {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	return (
		<div className="mx-4 my-4 flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-[13px] text-muted-foreground">
			<LuClock className="size-4 shrink-0" />
			<Trans>Send scheduled for {when}</Trans>
		</div>
	);
}
