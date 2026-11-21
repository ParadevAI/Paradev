import { formatDateTime } from "@superset/i18n/format";
import { describeSchedule } from "@superset/shared/rrule";
import type { Routine } from "../../../../types";
import { cadenceOf } from "../../../../utils/scheduleForm";

/** What a routine's row says on its right: when it runs, or what it watches. */
export function routineSummary(
	routine: Routine,
	labels: { paused: string; monitoring: string },
): string {
	if (!routine.enabled) return labels.paused;
	const { schedule } = routine;
	if (schedule?.rrule) return describeSchedule(cadenceOf(schedule.rrule));
	if (schedule) {
		return formatDateTime(new Date(schedule.dtstart), {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZone: schedule.timezone,
		});
	}
	const first = routine.watching[0];
	if (first?.kind === "channel") return `#${first.name}`;
	return labels.monitoring;
}
