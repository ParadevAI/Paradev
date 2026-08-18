import type {
	GmailTriggerEvent,
	GoogleCalendarTriggerEvent,
	TriggerActor,
	TriggerScope,
} from "../automation-triggers";
import {
	actorAllows,
	type BaseMatchableEvent,
	bodyMatches,
	type MatchContext,
	type MatchResult,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

const no = (reason: string): MatchResult => ({ matches: false, reason });

/**
 * A synced calendar change or a fire we scheduled off one, normalized to what
 * the triggers filter on. Emails are lower-cased at record time so the
 * comparison here is exact.
 */
export type GoogleCalendarMatchableEvent = BaseMatchableEvent & {
	provider: "google_calendar";
	/** Both Google kinds share one connection, so `me` resolves through it. */
	identityProvider: "google";
	eventType: GoogleCalendarTriggerEvent;
	/**
	 * The Google account the event came from, lower-cased. Connections are
	 * per member, so a trigger only sees events from its owner's account.
	 */
	accountEmail: string;
	calendarId: string;
	/** Organizer, creator and invitees together — everyone on the event. */
	attendeeEmails: string[];
	title: string | null;
	/** Someone on the event is outside the connected account's domain. */
	hasExternalAttendee: boolean;
	/** Set on `event.starting_soon`; how far ahead the fire was scheduled. */
	minutesBefore: number | null;
};

/** An arriving mail, normalized from its headers and label ids. */
export type GmailMatchableEvent = BaseMatchableEvent & {
	provider: "gmail";
	identityProvider: "google";
	eventType: GmailTriggerEvent;
	accountEmail: string;
	fromAddress: string | null;
	toAddresses: string[];
	subject: string | null;
	labelIds: string[];
	hasAttachment: boolean;
};

/**
 * `context.ownerIds` are addresses here: a calendar event names people by
 * email, so the Google identity's external id is the account address and `me`
 * resolves to the automation owner's linked addresses. The same ids say whose
 * account the event came from — a Google connection is one member's, and only
 * that member's automations see its events.
 */
export function ownsAccount(
	event: { accountEmail: string },
	context: MatchContext,
): boolean {
	return context.ownerIds.includes(event.accountEmail);
}

export function googleCalendarTriggerMatches(
	config: {
		event: string;
		calendars: TriggerScope;
		attendee: TriggerActor;
		titleFilter: { pattern: string; isRegex: boolean } | null;
		hasExternalAttendee?: boolean;
		minutesBefore?: number;
	},
	event: GoogleCalendarMatchableEvent,
	context: MatchContext,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (!ownsAccount(event, context)) return no("account");
	if (!scopeAllows(config.calendars, event.calendarId)) return no("calendar");
	if (
		!attendeeAllows(config.attendee, event.attendeeEmails, context.ownerIds)
	) {
		return no("attendee");
	}
	if (!bodyMatches(config.titleFilter, event.title)) return no("titleFilter");
	if (config.hasExternalAttendee && !event.hasExternalAttendee) {
		return no("hasExternalAttendee");
	}
	// The fire was scheduled for one lead time; a trigger asking for another
	// gets its own fire rather than this one.
	if (
		config.minutesBefore !== undefined &&
		config.minutesBefore !== event.minutesBefore
	) {
		return no("minutesBefore");
	}
	return { matches: true };
}

/**
 * The actor filter over a list of people rather than one: an event is a match
 * when any of its attendees satisfies it.
 */
function attendeeAllows(
	actor: TriggerActor,
	attendeeEmails: string[],
	ownerEmails: string[],
): boolean {
	if (actor === "anyone") return true;
	return attendeeEmails.some((email) => actorAllows(actor, email, ownerEmails));
}

export function gmailTriggerMatches(
	config: {
		event: string;
		from: TriggerScope;
		to: TriggerScope;
		subjectFilter: { pattern: string; isRegex: boolean } | null;
		labels: TriggerScope;
		hasAttachment: boolean;
	},
	event: GmailMatchableEvent,
	context: MatchContext,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (!ownsAccount(event, context)) return no("account");
	if (
		!addressScopeAllows(
			config.from,
			event.fromAddress ? [event.fromAddress] : [],
		)
	) {
		return no("from");
	}
	// Recipients and labels only narrow when configured; null means the trigger
	// author did not choose to filter on them, which for these is "any".
	if (config.to !== null && !addressScopeAllows(config.to, event.toAddresses)) {
		return no("to");
	}
	if (!bodyMatches(config.subjectFilter, event.subject)) {
		return no("subjectFilter");
	}
	if (
		config.labels !== null &&
		!scopeAllowsAny(config.labels, event.labelIds)
	) {
		return no("label");
	}
	if (config.hasAttachment && !event.hasAttachment) return no("hasAttachment");
	return { matches: true };
}

/**
 * A scope over addresses where each id is either a full address or a bare
 * domain, so "acme.com" admits everyone there. Both sides are compared
 * lower-cased; the recorded addresses already are.
 */
export function addressScopeAllows(
	scope: TriggerScope,
	addresses: string[],
): boolean {
	if (scope === null) return false;
	if (scope.mode === "any") return true;
	const wanted = scope.ids.map((id) => id.trim().toLowerCase());
	return addresses.some((address) =>
		wanted.some((id) =>
			id.includes("@") ? address === id : address.endsWith(`@${id}`),
		),
	);
}
