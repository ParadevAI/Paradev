/** Sending, archiving and labelling as the person; connections made before it was asked for lack it. */
export const GMAIL_MODIFY_SCOPE =
	"https://www.googleapis.com/auth/gmail.modify";

/** Events on the calendars the person owns: reading, answering, creating and changing them. Connections made before it was asked for lack it. */
export const CALENDAR_EVENTS_SCOPE =
	"https://www.googleapis.com/auth/calendar.events.owned";
const CALENDAR_ALL_EVENTS_SCOPE =
	"https://www.googleapis.com/auth/calendar.events";
/** When other people are busy, without what they are doing. */
export const CALENDAR_FREEBUSY_SCOPE =
	"https://www.googleapis.com/auth/calendar.freebusy";
const CALENDAR_FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

export const GOOGLE_SCOPES = [
	"openid",
	"email",
	"https://www.googleapis.com/auth/gmail.readonly",
	GMAIL_MODIFY_SCOPE,
	CALENDAR_EVENTS_SCOPE,
	CALENDAR_FREEBUSY_SCOPE,
] as const;

/** What a connection's granted scopes let Superset do in Google Calendar as the person. */
export function calendarAccess(scopes: readonly string[]): {
	canUseEvents: boolean;
	canSeeOthersBusy: boolean;
} {
	const has = (scope: string) => scopes.includes(scope);
	const full = has(CALENDAR_FULL_SCOPE);
	return {
		canUseEvents:
			full || has(CALENDAR_EVENTS_SCOPE) || has(CALENDAR_ALL_EVENTS_SCOPE),
		canSeeOthersBusy: full || has(CALENDAR_FREEBUSY_SCOPE),
	};
}

const GMAIL_FULL_SCOPE = "https://mail.google.com/";
const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

/** What a connection's granted scopes let Superset do in Gmail as the person. */
export function gmailAccess(scopes: readonly string[]): {
	canSend: boolean;
	canArchive: boolean;
} {
	const has = (scope: string) => scopes.includes(scope);
	const canArchive = has(GMAIL_MODIFY_SCOPE) || has(GMAIL_FULL_SCOPE);
	return { canSend: canArchive || has(GMAIL_COMPOSE_SCOPE), canArchive };
}

export const REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const REFRESH_TOKEN_TIMEOUT_MS = 10 * 1000;
export const GOOGLE_API_TIMEOUT_MS = 20 * 1000;

/** Gmail's watch is capped at seven days. */
export const GMAIL_WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Renew anything that would expire within this window on the next cron. */
export const WATCH_RENEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Any of these lets `users.watch` and `users.history.list` read the mailbox. */
export const GMAIL_READ_SCOPES = [
	"https://mail.google.com/",
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/gmail.readonly",
] as const;
