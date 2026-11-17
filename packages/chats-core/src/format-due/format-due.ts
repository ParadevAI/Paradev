import { toDateString } from "../task-command/task-command.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Tomorrow", "Yesterday", a weekday within the next week, else "12 Oct". */
export function formatDue(
	due: string,
	now: Date,
): { label: string; overdue: boolean } {
	const today = toDateString(now);
	const [y, m, d] = due.split("-").map(Number);
	const date = new Date(y!, m! - 1, d!);
	const days = Math.round(
		(date.getTime() -
			new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
			DAY_MS,
	);
	const overdue = due < today;
	if (days === 0) return { label: "Today", overdue };
	if (days === 1) return { label: "Tomorrow", overdue };
	if (days === -1) return { label: "Yesterday", overdue };
	if (days > 1 && days < 7)
		return {
			label: date.toLocaleDateString(undefined, { weekday: "long" }),
			overdue,
		};
	return {
		label: date.toLocaleDateString(undefined, {
			day: "numeric",
			month: "short",
		}),
		overdue,
	};
}
