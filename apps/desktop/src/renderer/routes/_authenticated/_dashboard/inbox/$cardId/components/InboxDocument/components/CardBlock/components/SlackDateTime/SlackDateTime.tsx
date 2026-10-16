import { dayOf, minuteOfDay, zonedInstant } from "../../utils/zoneTime";
import { DateField } from "../DateField";
import { TimeSelect } from "../TimeSelect";

interface SlackDateTimeProps {
	/** The instant, in milliseconds. */
	value: number;
	/** IANA zone the fields read and write in. */
	timeZone: string;
	onChange: (value: number) => void;
	dateLabel: string;
	timeLabel: string;
	disabled?: boolean;
	invalid?: boolean;
}

const FIELD =
	"h-8 rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-foreground/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive";

/** A day and a time of day in the reader's Slack zone, as one instant. */
export function SlackDateTime({
	value,
	timeZone,
	onChange,
	dateLabel,
	timeLabel,
	disabled,
	invalid,
}: SlackDateTimeProps) {
	const day = dayOf(value, timeZone);
	const minute = minuteOfDay(value, timeZone);
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			<DateField
				className={FIELD}
				value={day}
				label={dateLabel}
				disabled={disabled}
				invalid={invalid}
				onChange={(next) => onChange(zonedInstant(next, minute, timeZone))}
			/>
			<TimeSelect
				className={FIELD}
				day={day}
				value={minute}
				timeZone={timeZone}
				label={timeLabel}
				disabled={disabled}
				invalid={invalid}
				onChange={(next) => onChange(zonedInstant(day, next, timeZone))}
			/>
		</span>
	);
}
