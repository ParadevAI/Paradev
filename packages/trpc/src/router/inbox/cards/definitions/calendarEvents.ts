import type { calendar_v3 } from "@googleapis/calendar";
import { htmlToText } from "../../../../lib/gmail/mime";
import type {
	CalendarBusyView,
	CalendarEventView,
	CalendarGuestView,
	CalendarResponse,
	CalendarSpan,
} from "../types";
import { startOfZonedDay, zonedInstant, zonedParts } from "./calendarTime";

type Event = calendar_v3.Schema$Event;

const RESPONSES = new Set(["accepted", "declined", "tentative", "needsAction"]);

function responseOf(value: string | null | undefined): CalendarResponse {
	return RESPONSES.has(value ?? "")
		? (value as CalendarResponse)
		: "needsAction";
}

function instantOf(
	point: calendar_v3.Schema$EventDateTime | undefined,
	timeZone: string,
): Date | null {
	if (point?.dateTime) return new Date(point.dateTime);
	if (!point?.date) return null;
	const [year = 0, month = 1, day = 1] = point.date.split("-").map(Number);
	return zonedInstant({ year, month, day, hour: 0, minute: 0 }, timeZone);
}

/** When an event runs; an all-day one runs midnight to midnight in the calendar's zone. Null for an event with no time. */
export function spanOf(
	event: Event,
	timeZone: string,
): (CalendarSpan & { allDay: boolean }) | null {
	const start = instantOf(event.start, timeZone);
	const end = instantOf(event.end, timeZone);
	if (!start || !end) return null;
	return {
		start: start.toISOString(),
		end: end.toISOString(),
		allDay: Boolean(event.start?.date),
	};
}

function guestOf(
	attendee: calendar_v3.Schema$EventAttendee,
	reader: { photo: string | null; name?: string | null },
): CalendarGuestView {
	return {
		email: attendee.email ?? "",
		name:
			attendee.displayName || (attendee.self ? (reader.name ?? null) : null),
		self: Boolean(attendee.self),
		organizer: Boolean(attendee.organizer),
		optional: Boolean(attendee.optional),
		response: responseOf(attendee.responseStatus),
		comment: attendee.comment?.trim() || null,
		photo: attendee.self ? reader.photo : null,
	};
}

const RESPONSE_RANK: Record<CalendarResponse, number> = {
	accepted: 1,
	declined: 2,
	tentative: 3,
	needsAction: 4,
};

/** Google's guest list order: the organizer, then by answer, required guests before optional ones, then by name. */
function guestRank(guest: CalendarGuestView): number {
	if (guest.organizer) return 0;
	return RESPONSE_RANK[guest.response] * 2 + (guest.optional ? 1 : 0);
}

/** The event as Google's detail view shows it. Rooms and other resources are not guests. */
export function toEventView(
	event: Event,
	context: { timeZone: string; photo: string | null; name?: string | null },
): CalendarEventView | null {
	const span = spanOf(event, context.timeZone);
	if (!span || !event.id) return null;
	const video = event.conferenceData?.entryPoints?.find(
		(entry) => entry.entryPointType === "video",
	);
	const guests = (event.attendees ?? [])
		.filter((attendee) => attendee.email && !attendee.resource)
		.map((attendee) => guestOf(attendee, context))
		.sort(
			(a, b) =>
				guestRank(a) - guestRank(b) ||
				(a.name ?? a.email).localeCompare(b.name ?? b.email),
		);
	return {
		id: event.id,
		title: event.summary?.trim() || "(No title)",
		...span,
		timeZone: context.timeZone,
		location: event.location?.trim() || null,
		description: event.description ? htmlToText(event.description) : null,
		meetUrl: event.hangoutLink ?? video?.uri ?? null,
		url: event.htmlLink ?? "https://calendar.google.com/",
		recurring: Boolean(event.recurringEventId || event.recurrence?.length),
		cancelled: event.status === "cancelled",
		organizer: {
			email: event.organizer?.email ?? "",
			name: event.organizer?.displayName || null,
			self: Boolean(event.organizer?.self),
		},
		guests,
	};
}

/** What holds the reader's time: not a cancelled event, one marked free, or one they declined. */
export function toBusy(
	events: Event[],
	timeZone: string,
	skip: ReadonlySet<string> = new Set(),
): CalendarBusyView[] {
	return events.flatMap((event): CalendarBusyView[] => {
		if (!event.id || skip.has(event.id)) return [];
		if (event.status === "cancelled" || event.transparency === "transparent")
			return [];
		const mine = event.attendees?.find((attendee) => attendee.self);
		if (mine?.responseStatus === "declined") return [];
		const span = spanOf(event, timeZone);
		if (!span) return [];
		return [
			{
				id: event.id,
				title: event.summary?.trim() || "(No title)",
				...span,
				response: mine ? responseOf(mine.responseStatus) : null,
			},
		];
	});
}

export function overlaps(a: CalendarSpan, b: CalendarSpan): boolean {
	return (
		Date.parse(a.start) < Date.parse(b.end) &&
		Date.parse(b.start) < Date.parse(a.end)
	);
}

export function conflictsWith(
	span: CalendarSpan,
	busy: CalendarBusyView[],
): CalendarBusyView[] {
	return busy.filter((event) => overlaps(span, event));
}

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const SLOT_STEP_MINUTES = 30;
/** Nobody can take a meeting offered for two minutes from now. */
const LEAD_MINUTES = 60;

/**
 * Open times of `minutes` on weekdays in working hours, on the half hour,
 * clear of everything in `busy`, soonest first, at most `perDay` a day so one
 * empty day doesn't crowd out the rest.
 */
export function openSlots(args: {
	busy: CalendarSpan[];
	window: CalendarSpan;
	minutes: number;
	timeZone: string;
	now: Date;
	perDay?: number;
	limit?: number;
}): CalendarSpan[] {
	const { busy, window, minutes, timeZone, now } = args;
	const perDay = args.perDay ?? 3;
	const limit = args.limit ?? 12;
	const slots: CalendarSpan[] = [];
	const from = Math.max(
		Date.parse(window.start),
		now.getTime() + LEAD_MINUTES * 60_000,
	);
	const until = Date.parse(window.end);
	const first = new Date(from);
	for (let offset = 0; slots.length < limit; offset++) {
		const day = startOfZonedDay(first, timeZone, offset);
		if (day.getTime() >= until) break;
		const { year, month, day: date, weekday } = zonedParts(day, timeZone);
		if (weekday === 0 || weekday === 6) continue;
		let taken = 0;
		for (
			let minute = WORK_START_HOUR * 60;
			minute + minutes <= WORK_END_HOUR * 60 &&
			taken < perDay &&
			slots.length < limit;
			minute += SLOT_STEP_MINUTES
		) {
			const start = zonedInstant(
				{ year, month, day: date, hour: 0, minute },
				timeZone,
			);
			const slot = {
				start: start.toISOString(),
				end: new Date(start.getTime() + minutes * 60_000).toISOString(),
			};
			if (start.getTime() < from || Date.parse(slot.end) > until) continue;
			if (busy.some((event) => overlaps(slot, event))) continue;
			const last = slots[slots.length - 1];
			if (last && taken > 0 && Date.parse(last.end) > start.getTime()) continue;
			slots.push(slot);
			taken++;
		}
	}
	return slots;
}

/** A time as an English email states it: "Tue, Oct 6, 10:00 – 10:45 AM PDT". */
export function describeSpan(span: CalendarSpan, timeZone: string): string {
	const day = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(new Date(span.start));
	const clock = (instant: string, zone: boolean) =>
		new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "numeric",
			minute: "2-digit",
			...(zone ? { timeZoneName: "short" } : {}),
		}).format(new Date(instant));
	return `${day}, ${clock(span.start, false)} – ${clock(span.end, true)}`;
}

const LIST_PAGE = 250;
const LIST_PAGES_MAX = 4;

/** The reader's primary calendar over a window, recurring events expanded, with the zone the calendar shows. */
export async function listEvents(
	client: calendar_v3.Calendar,
	window: CalendarSpan,
): Promise<{ events: Event[]; timeZone: string }> {
	const events: Event[] = [];
	let timeZone = "UTC";
	let pageToken: string | undefined;
	for (let page = 0; page < LIST_PAGES_MAX; page++) {
		const { data } = await client.events.list({
			calendarId: "primary",
			timeMin: window.start,
			timeMax: window.end,
			singleEvents: true,
			orderBy: "startTime",
			maxResults: LIST_PAGE,
			pageToken,
		});
		events.push(...(data.items ?? []));
		timeZone = data.timeZone ?? timeZone;
		pageToken = data.nextPageToken ?? undefined;
		if (!pageToken) break;
	}
	return { events, timeZone };
}
