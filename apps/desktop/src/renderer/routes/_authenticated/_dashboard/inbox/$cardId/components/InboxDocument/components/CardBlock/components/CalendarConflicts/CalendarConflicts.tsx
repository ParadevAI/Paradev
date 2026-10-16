import { Plural, Trans } from "@lingui/react/macro";
import { LuTriangleAlert } from "react-icons/lu";
import type { CalendarBusyView } from "../../types";
import { timeRange } from "../../utils/calendarTime";

interface CalendarConflictsProps {
	conflicts: CalendarBusyView[];
	timeZone: string;
}

/** What on the reader's calendar overlaps a time; nothing when it is free. */
export function CalendarConflicts({
	conflicts,
	timeZone,
}: CalendarConflictsProps) {
	if (conflicts.length === 0) return null;
	return (
		<div className="flex gap-3 text-[13px]">
			<LuTriangleAlert
				aria-hidden
				className="mt-0.5 size-4 shrink-0 text-warning"
				strokeWidth={1.5}
			/>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-foreground">
					<Plural
						value={conflicts.length}
						one="# conflict on your calendar"
						other="# conflicts on your calendar"
					/>
				</span>
				<ul className="flex flex-col gap-0.5">
					{conflicts.map((conflict) => (
						<li key={conflict.id} className="flex gap-2">
							<span className="min-w-0 truncate text-foreground">
								{conflict.title}
							</span>
							<span className="shrink-0 text-muted-foreground">
								{conflict.allDay ? (
									<Trans>All day</Trans>
								) : (
									timeRange(conflict, timeZone)
								)}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
