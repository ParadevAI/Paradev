import type { calendar_v3 } from "@googleapis/calendar";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type {
	CalendarBusyView,
	CalendarEventView,
	CalendarSpan,
	CardContext,
} from "../types";
import { CardUnavailable } from "../types";
import {
	type CalendarAccount,
	calendarFor,
	calendarReadError,
} from "./calendarClient";
import { listEvents, overlaps, toBusy, toEventView } from "./calendarEvents";
import { startOfZonedDay, zonedInstant } from "./calendarTime";

export const EVENT_ID = /^[A-Za-z0-9_-]{5,1024}$/;
export const NOTE_MAX = 2000;
/** A card's refs hold short strings only, so a drafted note or reply fits in one. */
export const DRAFT_MAX = 500;
/** How many days of the reader's calendar a card carries for picking another time. */
export const WINDOW_DAYS = 7;
const SPAN_HOURS_MAX = 24;
const HOUR_MS = 3_600_000;

export const spanSchema = z
	.object({ start: z.string().datetime(), end: z.string().datetime() })
	.refine((span) => Date.parse(span.start) < Date.parse(span.end), {
		message: "The end must be after the start",
	})
	.refine(
		(span) =>
			Date.parse(span.end) - Date.parse(span.start) <= SPAN_HOURS_MAX * HOUR_MS,
		{ message: "That is longer than a day" },
	)
	.refine((span) => Date.parse(span.start) > Date.now(), {
		message: "That time has passed",
	});

const SPAN_MESSAGES = new Set([
	"The end must be after the start",
	"That is longer than a day",
	"That time has passed",
]);

export function describeSpanError(error: z.ZodError): string {
	const message = error.issues[0]?.message ?? "";
	return SPAN_MESSAGES.has(message) ? message : "That input could not be read";
}

export const noteSchema = z.string().trim().max(NOTE_MAX).optional();

export interface CalendarReader extends CalendarAccount {
	photo: string | null;
	/** Google sends no name for the reader's own guest entry, so their Superset name stands in. */
	name: string | null;
}

async function readerProfile(
	readerId: string,
): Promise<Pick<CalendarReader, "photo" | "name">> {
	const row = await db.query.users.findFirst({
		where: eq(users.id, readerId),
		columns: { image: true, name: true },
	});
	return { photo: row?.image ?? null, name: row?.name ?? null };
}

export async function calendarReader(
	ctx: CardContext,
): Promise<CalendarReader> {
	const [account, profile] = await Promise.all([
		calendarFor(ctx.organizationId, ctx.readerId),
		readerProfile(ctx.readerId).catch(() => ({ photo: null, name: null })),
	]);
	return { ...account, ...profile };
}

/** One event or one occurrence. A series id would answer, move or cancel every occurrence, so it is refused. */
export async function fetchEvent(
	client: calendar_v3.Calendar,
	eventId: string,
): Promise<calendar_v3.Schema$Event> {
	const { data } = await client.events
		.get({ calendarId: "primary", eventId })
		.catch(calendarReadError);
	if (data.recurrence?.length) {
		throw new CardUnavailable(
			"error",
			"That is a repeating series; name one occurrence of it",
		);
	}
	return data;
}

/** An instant, or a calendar date still to be read in the calendar's zone. */
export type Anchor = Date | { date: string };

export function anchorOf(event: calendar_v3.Schema$Event): Anchor {
	if (event.start?.dateTime) return new Date(event.start.dateTime);
	if (event.start?.date) return { date: event.start.date };
	throw new CardUnavailable("error", "That event has no time");
}

function dayStart(anchor: Anchor, timeZone: string): Date {
	if (anchor instanceof Date) return startOfZonedDay(anchor, timeZone);
	const [year = 0, month = 1, day = 1] = anchor.date.split("-").map(Number);
	return zonedInstant({ year, month, day, hour: 0, minute: 0 }, timeZone);
}

/** A week of the reader's calendar from the first moment of the anchor's day, without the events in `skip`. */
export async function weekFrom(
	reader: CalendarReader,
	anchor: Anchor,
	skip: ReadonlySet<string>,
): Promise<{
	timeZone: string;
	window: CalendarSpan;
	busy: CalendarBusyView[];
}> {
	const near =
		anchor instanceof Date ? anchor : new Date(`${anchor.date}T12:00:00Z`);
	const { events, timeZone } = await listEvents(reader.client, {
		start: new Date(near.getTime() - 48 * HOUR_MS).toISOString(),
		end: new Date(
			near.getTime() + (WINDOW_DAYS * 24 + 48) * HOUR_MS,
		).toISOString(),
	}).catch(calendarReadError);
	const start = dayStart(anchor, timeZone);
	const window = {
		start: start.toISOString(),
		end: startOfZonedDay(start, timeZone, WINDOW_DAYS).toISOString(),
	};
	return {
		timeZone,
		window,
		busy: toBusy(events, timeZone, skip).filter((event) =>
			overlaps(event, window),
		),
	};
}

export function eventView(
	event: calendar_v3.Schema$Event,
	reader: CalendarReader,
	timeZone: string,
): CalendarEventView {
	const view = toEventView(event, {
		timeZone,
		photo: reader.photo,
		name: reader.name,
	});
	if (!view) throw new CardUnavailable("error", "That event has no time");
	return view;
}

/** Who a note about the event goes to: the guests still coming, never the reader, a room, or a calendar's own address. */
export function noteRecipients(event: calendar_v3.Schema$Event): {
	to: string[];
	hidden: boolean;
} {
	const to = (event.attendees ?? []).flatMap((attendee) =>
		attendee.email &&
		!attendee.self &&
		!attendee.resource &&
		attendee.responseStatus !== "declined" &&
		!attendee.email.endsWith(".calendar.google.com")
			? [attendee.email]
			: [],
	);
	return { to, hidden: event.guestsCanSeeOtherGuests === false };
}
