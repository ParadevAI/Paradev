import { Trans } from "@lingui/react/macro";
import type { CalendarSpan, CardAction } from "../../../../types";
import { slotLine } from "../../../../utils/calendarTime";
import { ActionButton } from "../../../ActionButton";

interface PickedTimesProps {
	/** The picked times, soonest first. */
	times: CalendarSpan[];
	timeZone: string;
	/** Present when each time gets its own "Create event". */
	create: CardAction | undefined;
	pending: boolean;
	/** True for a time that has passed, which cannot become an event. */
	past: (time: CalendarSpan) => boolean;
	onCreate: (time: CalendarSpan) => void;
}

/** The times as they are listed under the reply, one per line. */
export function PickedTimes({
	times,
	timeZone,
	create,
	pending,
	past,
	onCreate,
}: PickedTimesProps) {
	if (times.length === 0) return null;
	return (
		<ul className="flex flex-col gap-1 text-[13px] text-foreground">
			{times.map((time) => (
				<li key={time.start} className="flex min-h-7 items-center gap-2">
					<span className="flex-1">{slotLine(time, timeZone)}</span>
					<ActionButton
						action={create}
						pending={pending}
						variant="ghost"
						disabled={past(time)}
						className="h-7 px-2 text-xs"
						onClick={() => onCreate(time)}
					>
						<Trans>Create event</Trans>
					</ActionButton>
				</li>
			))}
		</ul>
	);
}
