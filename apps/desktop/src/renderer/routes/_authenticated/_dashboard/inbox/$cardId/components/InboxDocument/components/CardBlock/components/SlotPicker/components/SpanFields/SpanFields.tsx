import { Trans, useLingui } from "@lingui/react/macro";
import type { CalendarSpan } from "../../../../types";
import {
	dayKey,
	dayOf,
	minuteOfDay,
	type ZoneDay,
	zonedInstant,
} from "../../../../utils/zoneTime";
import { DateField } from "../../../DateField";
import { TimeSelect } from "../../../TimeSelect";

interface SpanFieldsProps {
	value: CalendarSpan;
	/** IANA zone the fields read and write in. */
	timeZone: string;
	onChange: (value: CalendarSpan) => void;
	disabled?: boolean;
}

const FIELD =
	"h-8 rounded-md bg-muted/60 px-2.5 text-[13px] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-1 aria-invalid:ring-destructive";

/** Google's Starts and Ends fields: moving the start keeps the length, moving the end changes it. */
export function SpanFields({
	value,
	timeZone,
	onChange,
	disabled,
}: SpanFieldsProps) {
	const { t } = useLingui();
	const start = Date.parse(value.start);
	const end = Date.parse(value.end);
	const startDay = dayOf(start, timeZone);
	const startMinute = minuteOfDay(start, timeZone);
	const endDay = dayOf(end, timeZone);
	const endMinute = minuteOfDay(end, timeZone);
	const sameDay = dayKey(startDay) === dayKey(endDay);
	const backwards = end <= start;

	const setStart = (day: ZoneDay, minute: number) => {
		const next = zonedInstant(day, minute, timeZone);
		onChange({
			start: new Date(next).toISOString(),
			end: new Date(next + (end - start)).toISOString(),
		});
	};
	const setEnd = (day: ZoneDay, minute: number) =>
		onChange({
			start: value.start,
			end: new Date(zonedInstant(day, minute, timeZone)).toISOString(),
		});

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">
					<Trans>Starts</Trans>
				</span>
				<div className="flex flex-wrap gap-1.5">
					<DateField
						className={FIELD}
						disabled={disabled}
						value={startDay}
						label={t({ message: "Start date" })}
						onChange={(day) => setStart(day, startMinute)}
					/>
					<TimeSelect
						className={FIELD}
						disabled={disabled}
						day={startDay}
						value={startMinute}
						timeZone={timeZone}
						label={t({ message: "Start time" })}
						onChange={(minute) => setStart(startDay, minute)}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">
					<Trans>Ends</Trans>
				</span>
				<div className="flex flex-wrap gap-1.5">
					<DateField
						className={FIELD}
						disabled={disabled}
						value={endDay}
						invalid={backwards}
						label={t({ message: "End date" })}
						onChange={(day) => setEnd(day, endMinute)}
					/>
					<TimeSelect
						className={FIELD}
						disabled={disabled}
						day={endDay}
						value={endMinute}
						timeZone={timeZone}
						from={sameDay && !backwards ? startMinute : undefined}
						invalid={backwards}
						label={t({ message: "End time" })}
						onChange={(minute) => setEnd(endDay, minute)}
					/>
				</div>
			</div>
		</div>
	);
}
