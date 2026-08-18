import { db } from "@superset/db/client";
import {
	automationEvents,
	type SelectIntegrationConnection,
} from "@superset/db/schema";
import type { GoogleCalendarTriggerEvent } from "@superset/shared/automation-triggers";
import {
	eventStart,
	type GoogleCalendarEvent,
	googleConfigOf,
	listEventChanges,
	listEventInstances,
	patchCalendarState,
} from "@superset/trpc/integrations/google";
import { and, desc, eq } from "drizzle-orm";
import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import { recordAutomationEvent } from "@/lib/automations/recordAutomationEvent";
import {
	accountDomain,
	accountEmail,
	calendarPayload,
	matchableCalendarEvent,
	resourceKeyFor,
} from "./calendarEvents";
import {
	loadFirePlan,
	scheduleFires,
	sweepWindow,
} from "./scheduleCalendarFires";

export type CalendarSyncResult = {
	/** Nothing was recorded: the calendar had no sync token yet, or lost it. */
	baseline: boolean;
	changed: number;
	recorded: number;
	matched: number;
	/** starting_soon/ended fires handed to QStash off these changes. */
	scheduled: number;
};

/**
 * Pulls what changed on one calendar since the last sync and records each
 * change as an automation event.
 *
 * Google's push says only that something changed. The stored sync token is
 * what turns that into a list, and the first sync of a calendar — or the one
 * after a token expires — records nothing: it exists to obtain the token, and
 * replaying a whole calendar's history as "created" would fire every trigger
 * on it at once.
 */
export async function syncCalendar(
	connection: SelectIntegrationConnection,
	calendarId: string,
): Promise<CalendarSyncResult> {
	const state = googleConfigOf(connection.config).calendars?.[calendarId];
	const result = await listEventChanges(
		connection.id,
		calendarId,
		state?.syncToken,
	);

	if (result.expired) {
		const fresh = await listEventChanges(connection.id, calendarId, undefined);
		if (fresh.expired) {
			throw new Error(`Calendar ${calendarId}: full sync returned 410`);
		}
		await patchCalendarState(connection.id, calendarId, {
			syncToken: fresh.nextSyncToken,
			watchedSince: state?.watchedSince ?? new Date().toISOString(),
		});
		return {
			baseline: true,
			changed: 0,
			recorded: 0,
			matched: 0,
			scheduled: 0,
		};
	}

	if (!state?.syncToken) {
		await patchCalendarState(connection.id, calendarId, {
			syncToken: result.nextSyncToken,
			watchedSince: new Date().toISOString(),
		});
		return {
			baseline: true,
			changed: 0,
			recorded: 0,
			matched: 0,
			scheduled: 0,
		};
	}

	const applied = await applyCalendarChanges(
		connection,
		calendarId,
		result.items,
		{
			watchedSince: state.watchedSince
				? new Date(state.watchedSince)
				: new Date(0),
		},
	);

	await patchCalendarState(connection.id, calendarId, {
		syncToken: result.nextSyncToken,
	});

	return { baseline: false, changed: result.items.length, ...applied };
}

/**
 * Records and dispatches a list of changed events, as `events.list` returned
 * them. Separate from the listing so the same path runs over a captured page.
 */
export async function applyCalendarChanges(
	connection: SelectIntegrationConnection,
	calendarId: string,
	items: GoogleCalendarEvent[],
	options: { watchedSince: Date; now?: Date },
): Promise<{ recorded: number; matched: number; scheduled: number }> {
	const domain = accountDomain(connection);
	const plan = await loadFirePlan(
		connection.organizationId,
		connection.connectedByUserId,
	);
	const now = options.now ?? new Date();

	let recorded = 0;
	let matched = 0;
	let scheduled = 0;
	for (const item of items) {
		const outcome = await recordChange({
			connection,
			calendarId,
			item,
			watchedSince: options.watchedSince,
			domain,
		});
		if (!outcome) continue;
		recorded += 1;
		matched += outcome.matched;

		// A change inside the horizon may move a fire; the sweep would catch it
		// eventually, but a meeting created for twenty minutes from now needs
		// its "starting soon" before the next sweep.
		if (plan && item.status !== "cancelled" && eventStart(item)) {
			// Best effort: the sweep reschedules anything missed here, whereas a
			// failure that aborted the loop would leave the rest of this page
			// unrecorded until Google retried the push.
			try {
				const instances = item.recurrence
					? await listEventInstances(
							connection.id,
							calendarId,
							item.id,
							sweepWindow(plan, now),
						)
					: [item];
				scheduled += await scheduleFires({
					connectionId: connection.id,
					calendarId,
					instances,
					plan,
					now,
				});
			} catch (error) {
				console.error(
					`[google/calendar] scheduling fires for ${calendarId}/${item.id} failed:`,
					error,
				);
			}
		}
	}
	return { recorded, matched, scheduled };
}

/**
 * Created, updated or cancelled, decided from what we already recorded.
 *
 * "Created" needs two things: no prior row for this event on this calendar,
 * and Google's `created` timestamp after we started watching. Without the
 * second, editing an event that predates the connection would read as its
 * creation; without the first, every later edit of a new event would.
 */
async function recordChange(params: {
	connection: SelectIntegrationConnection;
	calendarId: string;
	item: GoogleCalendarEvent;
	watchedSince: Date;
	domain: string | null;
}): Promise<{ matched: number } | null> {
	const { connection, calendarId, item } = params;
	const resourceKey = resourceKeyFor(connection.id, calendarId, item.id);

	const [previous] = await db
		.select({ payload: automationEvents.payload })
		.from(automationEvents)
		.where(
			and(
				eq(automationEvents.organizationId, connection.organizationId),
				eq(automationEvents.provider, "google_calendar"),
				eq(automationEvents.resourceKey, resourceKey),
			),
		)
		.orderBy(desc(automationEvents.receivedAt))
		.limit(1);

	let eventType: GoogleCalendarTriggerEvent;
	// A cancellation in an incremental sync carries little more than the id and
	// status; the title and attendees come from what was recorded before it.
	let event = item;
	if (item.status === "cancelled") {
		eventType = "event.cancelled";
		const before = (previous?.payload as { event?: GoogleCalendarEvent } | null)
			?.event;
		if (before) event = { ...before, ...item, status: "cancelled" };
	} else if (
		!previous &&
		item.created &&
		new Date(item.created).getTime() >= params.watchedSince.getTime()
	) {
		eventType = "event.created";
	} else {
		eventType = "event.updated";
	}

	const matchable = matchableCalendarEvent({
		eventType,
		accountEmail: accountEmail(connection),
		calendarId,
		event,
		domain: params.domain,
	});
	const inserted = await recordAutomationEvent(db, {
		organizationId: connection.organizationId,
		integrationConnectionId: connection.id,
		provider: "google_calendar",
		eventType,
		// A stable key: an item carrying neither `updated` nor `etag` collapses
		// onto one row per status rather than one per delivery.
		externalEventId: `${calendarId}:${item.id}:${item.updated ?? item.etag ?? item.status ?? "unknown"}`,
		resourceKey,
		title: event.summary ?? item.id,
		url: event.htmlLink ?? null,
		actorLogin: event.organizer?.email?.toLowerCase() ?? null,
		actorIsExternal: matchable.hasExternalAttendee,
		payload: calendarPayload(calendarId, event, matchable),
	});
	if (!inserted) return null;

	const { matched } = await dispatchMatchingTriggers({
		organizationId: connection.organizationId,
		eventId: inserted.id,
		event: matchable,
	});
	return { matched };
}
