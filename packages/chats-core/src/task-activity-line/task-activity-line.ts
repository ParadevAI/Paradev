import type { ChatState } from "../chat-state/chat-state.ts";
import type { TaskActivity, TaskStatus } from "../model/model.ts";
import { TASK_STATUS_LABEL } from "../task-status/task-status.ts";

/** Statuses tasks no longer have, as their old activity entries still name them. */
const RETIRED_STATUS_LABEL: Record<string, string> = {
	needs_review: "Needs review",
};

import { whenLabel } from "../task-time/task-time.ts";

/** How an entry reads: a one-line event, a Dev's work note, a person's comment, or a failure. */
export type ActivityTone = "event" | "work" | "comment" | "failed";

export interface ActivityLine {
	/** Who did it; null when Dev itself did (a reminder, a run that failed). */
	who: {
		kind: "user" | "dev";
		id: string;
		name: string;
		color?: string;
	} | null;
	text: string;
	tone: ActivityTone;
}

/** Whoever an `assigned` entry names: a Dev, you, a member, or nobody (unassigned). */
function assigneeName(state: ChatState, id: string): string {
	if (!id) return "nobody";
	if (id === state.meId) return "you";
	return state.devs[id]?.name ?? state.members[id]?.name ?? "someone";
}

/** A task's activity entry in words, for its timeline; times it names read relative to `now`. */
export function activityLine(
	state: ChatState,
	entry: TaskActivity,
	now: Date,
): ActivityLine {
	const actor = entry.actor;
	const who: ActivityLine["who"] = !actor
		? null
		: actor.kind === "dev"
			? {
					kind: "dev",
					id: actor.id,
					name: state.devs[actor.id]?.name ?? "A Dev",
					color: state.devs[actor.id]?.color,
				}
			: {
					kind: "user",
					id: actor.id,
					name:
						actor.id === state.meId
							? "You"
							: (state.members[actor.id]?.name ?? "Someone"),
				};
	const event = (text: string): ActivityLine => ({ who, text, tone: "event" });

	switch (entry.kind) {
		case "created":
			return event("created the task");
		case "assigned":
			return event(
				entry.text && entry.text === actor?.id
					? "took it"
					: `assigned it to ${assigneeName(state, entry.text)}`,
			);
		case "scheduled":
			return event(
				entry.text
					? `set it for ${whenLabel(entry.text, now)}`
					: "cleared the time",
			);
		case "started":
			return event(
				actor?.kind === "dev" ? "started working on it" : "started it",
			);
		case "progress":
			return { who, text: entry.text, tone: "work" };
		case "comment":
			return { who, text: entry.text, tone: "comment" };
		case "status":
			return event(
				`moved it to ${TASK_STATUS_LABEL[entry.text as TaskStatus] ?? RETIRED_STATUS_LABEL[entry.text] ?? entry.text}`,
			);
		case "done":
			return event("marked it done");
		case "reopened":
			return event("reopened it");
		case "reminded":
			return event("sent the reminder");
		case "edited":
			return event(
				entry.text ? `changed the ${entry.text}` : "edited the task",
			);
		case "failed":
			return { who, text: entry.text || "The run failed", tone: "failed" };
	}
}
