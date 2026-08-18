import { CALENDAR_CHANNEL_TTL_MS } from "./constants";
import { GoogleApiError, googleFetch } from "./refresh";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarListEntry = {
	id: string;
	summary?: string;
	primary?: boolean;
	accessRole?: string;
	deleted?: boolean;
	timeZone?: string;
};

export type GoogleCalendarPerson = {
	email?: string;
	displayName?: string;
	self?: boolean;
	organizer?: boolean;
	responseStatus?: string;
};

export type GoogleCalendarEvent = {
	id: string;
	status?: "confirmed" | "tentative" | "cancelled" | string;
	etag?: string;
	htmlLink?: string;
	summary?: string;
	description?: string;
	location?: string;
	created?: string;
	updated?: string;
	start?: { date?: string; dateTime?: string; timeZone?: string };
	end?: { date?: string; dateTime?: string; timeZone?: string };
	recurrence?: string[];
	recurringEventId?: string;
	organizer?: GoogleCalendarPerson;
	creator?: GoogleCalendarPerson;
	attendees?: GoogleCalendarPerson[];
	hangoutLink?: string;
	eventType?: string;
};

type EventsPage = {
	items?: GoogleCalendarEvent[];
	nextPageToken?: string;
	nextSyncToken?: string;
};

export async function listCalendars(
	connectionId: string,
): Promise<GoogleCalendarListEntry[]> {
	const items: GoogleCalendarListEntry[] = [];
	let pageToken: string | undefined;
	do {
		const params = new URLSearchParams({
			maxResults: "250",
			showDeleted: "false",
		});
		if (pageToken) params.set("pageToken", pageToken);
		const page = await googleFetch<{
			items?: GoogleCalendarListEntry[];
			nextPageToken?: string;
		}>(connectionId, `${CALENDAR_API}/users/me/calendarList?${params}`);
		items.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken);
	return items;
}

/**
 * The changes since `syncToken`, or the whole calendar when there is none.
 *
 * `showDeleted` is what makes cancellations visible; without it a deleted
 * event simply stops appearing. Recurring events come back as their master
 * plus any individually edited instances rather than expanded, so a busy
 * calendar's full sync is a handful of pages rather than every occurrence
 * until the end of time.
 */
export async function listEventChanges(
	connectionId: string,
	calendarId: string,
	syncToken: string | undefined,
): Promise<
	| { expired: true }
	| { expired: false; items: GoogleCalendarEvent[]; nextSyncToken: string }
> {
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	let nextSyncToken: string | undefined;
	do {
		const params = new URLSearchParams({
			showDeleted: "true",
			maxResults: syncToken ? "250" : "2500",
		});
		if (syncToken) params.set("syncToken", syncToken);
		if (pageToken) params.set("pageToken", pageToken);
		let page: EventsPage;
		try {
			page = await googleFetch<EventsPage>(
				connectionId,
				`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
			);
		} catch (error) {
			// 410 Gone: the token is too old to diff from. Google's protocol is to
			// drop it and start over with a full sync.
			if (error instanceof GoogleApiError && error.status === 410) {
				return { expired: true };
			}
			throw error;
		}
		items.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
		nextSyncToken = page.nextSyncToken;
	} while (pageToken);
	if (!nextSyncToken) {
		throw new Error(`Calendar sync of ${calendarId} returned no sync token`);
	}
	return { expired: false, items, nextSyncToken };
}

/**
 * Concrete occurrences starting in a window, recurring ones expanded, so a
 * fire can be scheduled off each start and end time.
 */
export async function listUpcomingInstances(
	connectionId: string,
	calendarId: string,
	window: { from: Date; to: Date },
): Promise<GoogleCalendarEvent[]> {
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	do {
		const params = new URLSearchParams({
			singleEvents: "true",
			orderBy: "startTime",
			timeMin: window.from.toISOString(),
			timeMax: window.to.toISOString(),
			maxResults: "250",
		});
		if (pageToken) params.set("pageToken", pageToken);
		const page = await googleFetch<EventsPage>(
			connectionId,
			`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
		);
		items.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken);
	return items;
}

/** The instances of one recurring event inside a window. */
export async function listEventInstances(
	connectionId: string,
	calendarId: string,
	eventId: string,
	window: { from: Date; to: Date },
): Promise<GoogleCalendarEvent[]> {
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	do {
		const params = new URLSearchParams({
			timeMin: window.from.toISOString(),
			timeMax: window.to.toISOString(),
			maxResults: "250",
		});
		if (pageToken) params.set("pageToken", pageToken);
		const page = await googleFetch<EventsPage>(
			connectionId,
			`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances?${params}`,
		);
		items.push(...(page.items ?? []));
		pageToken = page.nextPageToken;
	} while (pageToken);
	return items;
}

/** Null when the event no longer exists at all (404), as opposed to cancelled. */
export async function getEvent(
	connectionId: string,
	calendarId: string,
	eventId: string,
): Promise<GoogleCalendarEvent | null> {
	try {
		return await googleFetch<GoogleCalendarEvent>(
			connectionId,
			`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		);
	} catch (error) {
		if (error instanceof GoogleApiError && error.status === 404) return null;
		throw error;
	}
}

/**
 * Opens a push channel on a calendar. Google will POST to `address` with the
 * channel id and this token on every change; the token is what the push route
 * checks, since Google signs nothing.
 */
export async function watchCalendar(
	connectionId: string,
	calendarId: string,
	channel: { id: string; token: string; address: string },
): Promise<{ resourceId: string; expiration: number }> {
	const result = await googleFetch<{ resourceId: string; expiration?: string }>(
		connectionId,
		`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
		{
			method: "POST",
			body: JSON.stringify({
				id: channel.id,
				type: "web_hook",
				address: channel.address,
				token: channel.token,
				expiration: String(Date.now() + CALENDAR_CHANNEL_TTL_MS),
			}),
		},
	);
	return {
		resourceId: result.resourceId,
		expiration: Number(
			result.expiration ?? Date.now() + CALENDAR_CHANNEL_TTL_MS,
		),
	};
}

/** Best effort: a channel that is already gone is not an error worth raising. */
export async function stopChannel(
	connectionId: string,
	channel: { id: string; resourceId: string },
): Promise<void> {
	try {
		await googleFetch<undefined>(
			connectionId,
			`${CALENDAR_API}/channels/stop`,
			{
				method: "POST",
				body: JSON.stringify(channel),
			},
		);
	} catch (error) {
		if (error instanceof GoogleApiError && error.status === 404) return;
		throw error;
	}
}

/** RFC 3339 for timed events; all-day events carry a date and no time. */
export function eventStart(event: GoogleCalendarEvent): Date | null {
	return event.start?.dateTime ? new Date(event.start.dateTime) : null;
}

export function eventEnd(event: GoogleCalendarEvent): Date | null {
	return event.end?.dateTime ? new Date(event.end.dateTime) : null;
}

/** Everyone on the event — organizer, creator and invitees — lower-cased. */
export function eventAttendeeEmails(event: GoogleCalendarEvent): string[] {
	const emails = new Set<string>();
	for (const person of [
		event.organizer,
		event.creator,
		...(event.attendees ?? []),
	]) {
		if (person?.email) emails.add(person.email.toLowerCase());
	}
	return [...emails];
}
