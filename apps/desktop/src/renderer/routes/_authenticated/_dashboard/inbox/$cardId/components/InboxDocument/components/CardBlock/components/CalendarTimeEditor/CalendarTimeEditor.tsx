import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type {
	CalendarBusyView,
	CalendarEventView,
	CalendarSpan,
} from "../../types";
import { dayLine, timeRange } from "../../utils/calendarTime";
import { SlotPicker, SpanFields, spanMinutes } from "../SlotPicker";

interface CalendarTimeEditorProps {
	event: CalendarEventView;
	/** What heads the new time, "Your proposal:" on an invitation. */
	label: ReactNode;
	value: CalendarSpan;
	onChange: (value: CalendarSpan) => void;
	busy: CalendarBusyView[];
	window: CalendarSpan;
	disabled: boolean;
	/** Controls between the current time and the new one. */
	before?: ReactNode;
	/** Controls under the new time. */
	children?: ReactNode;
}

/** Google's "Propose a new time" view: the current time and the Starts and Ends fields beside the reader's calendar. */
export function CalendarTimeEditor({
	event,
	label,
	value,
	onChange,
	busy,
	window,
	disabled,
	before,
	children,
}: CalendarTimeEditorProps) {
	const others = busy.filter((entry) => entry.id !== event.id);
	return (
		<div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs font-medium text-foreground">
						<Trans>Current event time:</Trans>
					</span>
					<span className="text-[13px] text-foreground">
						{dayLine(event, event.timeZone, event.allDay)}
					</span>
					{!event.allDay && (
						<span className="text-xs text-muted-foreground">
							{timeRange(event, event.timeZone)}
						</span>
					)}
				</div>
				{before}
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-foreground">{label}</span>
					<SpanFields
						value={value}
						timeZone={event.timeZone}
						onChange={onChange}
						disabled={disabled}
					/>
				</div>
				{children}
			</div>
			<SlotPicker
				window={window}
				timeZone={event.timeZone}
				busy={others}
				minutes={Math.max(spanMinutes(value), 15)}
				value={[value]}
				onChange={(next) => {
					const picked = next[0];
					if (picked) onChange(picked);
				}}
				mode="single"
				disabled={disabled}
				className="min-w-0 self-start"
			/>
		</div>
	);
}
