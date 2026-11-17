import type { TriggerBatch } from "../model/model.ts";
import { formatClock } from "../task-time/task-time.ts";
import { toolkitName } from "../toolkits/toolkits.ts";

/** What a Dev said it did with an event: told the chat, acted on it, or let it pass. */
export type EventAction = "told" | "acted" | "skipped";

/** An event as the events lists read it (the API's shape, structurally). */
export interface EventLike {
	status: "pending" | "handled" | "dropped" | "capped";
	action?: EventAction | null;
}

/** The events lists' filter: every event, or those the Dev handled one way. */
export type EventFilter = "all" | EventAction;

export const EVENT_FILTERS: { value: EventFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "told", label: "Told you" },
	{ value: "acted", label: "Acted" },
	{ value: "skipped", label: "Skipped" },
];

/** How an event's chip looks: the Dev's action, else where the event stands. */
export type EventChipTone = EventAction | "handled" | "pending" | "muted";

/**
 * An event's chip: "Told you", "Acted", "Skipped" as the Dev reported it; "Handled" when its turn is done but the
 * Dev didn't say (older batches), "Handling" while it's on it, and why it never ran when it didn't.
 */
export function eventChip(event: EventLike): {
	label: string;
	tone: EventChipTone;
} {
	if (event.action === "told") return { label: "Told you", tone: "told" };
	if (event.action === "acted") return { label: "Acted", tone: "acted" };
	if (event.action === "skipped") return { label: "Skipped", tone: "skipped" };
	if (event.status === "pending") return { label: "Handling", tone: "pending" };
	if (event.status === "dropped") return { label: "Paused", tone: "muted" };
	if (event.status === "capped") return { label: "Over limit", tone: "muted" };
	return { label: "Handled", tone: "handled" };
}

/** A trigger event's line: its title, or "Gmail event" when the viewer isn't the trigger's person and gets none. */
export function eventTitle(event: {
	title: string | null;
	toolkit: string;
}): string {
	return event.title ?? `${toolkitName(event.toolkit)} event`;
}

/** The events a filter shows; an event the Dev didn't report shows only under All. */
export function filterEvents<E extends EventLike>(
	events: E[],
	filter: EventFilter,
): E[] {
	return filter === "all" ? events : events.filter((e) => e.action === filter);
}

/**
 * A thread's events line: "25 events handled", "Handling 3 new events…" while the Dev is on all of them, or
 * "25 events handled · handling 3…" when some are done.
 */
export function eventsLineLabel(count: number, handling: number): string {
	const events = (n: number) => `${n} ${n === 1 ? "event" : "events"}`;
	if (handling <= 0) return `${events(count)} handled`;
	if (handling >= count)
		return `Handling ${handling} new ${handling === 1 ? "event" : "events"}…`;
	return `${events(count - handling)} handled · handling ${handling}…`;
}

/**
 * When a list of events happened: "9:02 AM–11:15 AM" (as the locale writes times) within today, one time when they
 * fall in the same minute, and with their days when that isn't today or they span days ("Yesterday 7:41 PM – Today
 * 4:39 PM"), so a range never hides that it crossed midnight.
 */
export function eventsTimeRange(from: string, to: string, now: Date): string {
	const start = formatClock(new Date(from));
	const end = formatClock(new Date(to));
	const [fromDay, toDay] = [eventDayLabel(from, now), eventDayLabel(to, now)];
	if (fromDay !== toDay) return `${fromDay} ${start} – ${toDay} ${end}`;
	const day = toDay === "Today" ? "" : `${toDay} `;
	return start === end ? `${day}${start}` : `${day}${start}–${end}`;
}

/** An event's day as the events lists head it: "Today", "Yesterday", else "Mon 26 Oct" (the locale's). */
export function eventDayLabel(iso: string, now: Date): string {
	const at = new Date(iso);
	const day = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(now) - day(at)) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	return at.toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
		...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
	});
}

/**
 * A sender as people read it, from the subtitle an email event carries (`From:` as the mail had it): the name alone
 * when there is one, unquoted ("'Jared Burke' via support" <support@superset.sh> → Jared Burke via support), else the
 * address. Other subtitles (a Linear issue's team and state) pass as they are.
 */
export function eventSender(subtitle: string): string {
	const named = /^\s*(.+?)\s*<[^<>@\s]+@[^<>\s]+>\s*$/.exec(subtitle);
	if (named) {
		const name = named[1]!
			.replace(/"/g, "")
			.replace(/(^|\s)'|'(?=\s|$)/g, "$1")
			.trim();
		if (name) return name;
	}
	const bare = /^\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(subtitle);
	return bare ? bare[1]! : subtitle.trim();
}

/** How many events each filter keeps, for its tab: "Acted 15". */
export function eventCounts<E extends EventLike>(
	events: E[],
): Record<EventFilter, number> {
	return {
		all: events.length,
		told: filterEvents(events, "told").length,
		acted: filterEvents(events, "acted").length,
		skipped: filterEvents(events, "skipped").length,
	};
}

/**
 * What the Dev said about an event, once: in a turn of one event, the turn's outcome (the fuller account) else the
 * event's note; in a turn of several, each event's own note (the turn's outcome then sums them up, once).
 */
export function eventNote(
	event: { note?: string | null },
	batch: { outcome?: string | null; count: number },
): string | null {
	const own = event.note?.trim() || null;
	if (batch.count > 1) return own;
	return batch.outcome?.trim() || own;
}

/** One trigger's batches in an events list, newest first. */
export interface TriggerBatchGroup {
	/** The trigger's id, or `gone:<toolkit>` for batches whose trigger was removed. */
	key: string;
	triggerId: string | null;
	toolkit: string;
	batches: TriggerBatch[];
}

/** The batches of an events list by trigger, the trigger with the latest batch first, each one's newest first. */
export function groupBatchesByTrigger(
	batches: TriggerBatch[],
): TriggerBatchGroup[] {
	const groups = new Map<string, TriggerBatchGroup>();
	for (const batch of [...batches].sort((a, b) => b.at.localeCompare(a.at))) {
		const key = batch.triggerId ?? `gone:${batch.toolkit}`;
		const group = groups.get(key) ?? {
			key,
			triggerId: batch.triggerId,
			toolkit: batch.toolkit,
			batches: [],
		};
		group.batches.push(batch);
		groups.set(key, group);
	}
	return [...groups.values()];
}

/**
 * The groups an events list shows under a filter. Under All every batch; otherwise the batches with an event that
 * matches (a batch whose events haven't loaded stays, so it can show them), and the triggers left with any.
 */
export function filterBatchGroups<E extends EventLike>(
	groups: TriggerBatchGroup[],
	eventsOf: (batchId: string) => E[] | undefined,
	filter: EventFilter,
): TriggerBatchGroup[] {
	if (filter === "all") return groups;
	return groups.flatMap((group) => {
		const batches = group.batches.filter((b) => {
			const events = eventsOf(b.id);
			return !events || filterEvents(events, filter).length > 0;
		});
		return batches.length ? [{ ...group, batches }] : [];
	});
}

/** A trigger group's heading: the trigger's title as the chat has it, else its app's ("Gmail") once it's gone. */
export function triggerHeading(
	group: { triggerId: string | null; toolkit: string },
	triggers: { id: string; title: string }[] | null,
): string {
	const trigger = group.triggerId
		? triggers?.find((t) => t.id === group.triggerId)
		: undefined;
	return trigger?.title ?? toolkitName(group.toolkit);
}

/** A trigger's turns (newest first) in runs of the same day, each under its day's heading (`eventDayLabel`). */
export function batchesByDay(
	batches: TriggerBatch[],
	now: Date,
): { day: string; batches: TriggerBatch[] }[] {
	const days: { day: string; batches: TriggerBatch[] }[] = [];
	for (const batch of batches) {
		const day = eventDayLabel(batch.at, now);
		if (days.at(-1)?.day === day) days.at(-1)!.batches.push(batch);
		else days.push({ day, batches: [batch] });
	}
	return days;
}
