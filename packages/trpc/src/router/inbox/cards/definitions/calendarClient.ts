import { calendar, type calendar_v3 } from "@googleapis/calendar";
import {
	AmbiguousConnectionError,
	userConnection,
} from "../../../../lib/connectors/lookup";
import { googleAuthFor } from "../../../integration/google/auth";
import {
	calendarAccess,
	GOOGLE_API_TIMEOUT_MS,
} from "../../../integration/google/constants";
import { CardUnavailable } from "../types";

/** A connected account that lacks the calendar scopes is fixed by connecting again, which Settings offers as Reconnect. */
const RECONNECT_GOOGLE = {
	label: "Reconnect Google",
	href: "#/settings/integrations",
};

export const NEEDS_CALENDAR_SCOPE =
	"Reconnect Google to use your calendar from here";

export interface CalendarAccount {
	client: calendar_v3.Calendar;
	connectionId: string;
	/** The Google account the calendar belongs to. */
	email: string;
	canUseEvents: boolean;
	canSeeOthersBusy: boolean;
}

/** A calendar is one person's, so only the reader's own connection fits. */
export async function calendarFor(
	organizationId: string,
	userId: string,
): Promise<CalendarAccount> {
	let connection: Awaited<ReturnType<typeof userConnection>>;
	try {
		connection = await userConnection(organizationId, "google", userId);
	} catch (error) {
		if (error instanceof AmbiguousConnectionError) {
			throw new CardUnavailable("error", error.message);
		}
		throw error;
	}
	if (!connection) {
		throw new CardUnavailable(
			"no_connector",
			"Connect Google Calendar to see this",
			{
				label: "Connect Google",
				href: RECONNECT_GOOGLE.href,
			},
		);
	}
	const access = calendarAccess(connection.scopes ?? []);
	if (!access.canUseEvents) {
		throw new CardUnavailable(
			"no_connector",
			NEEDS_CALENDAR_SCOPE,
			RECONNECT_GOOGLE,
		);
	}
	let auth: Awaited<ReturnType<typeof googleAuthFor>>;
	try {
		auth = await googleAuthFor(connection.id);
	} catch {
		needsReconnect();
	}
	return {
		client: calendar({ version: "v3", auth, timeout: GOOGLE_API_TIMEOUT_MS }),
		connectionId: connection.id,
		email: connection.externalAccountId,
		...access,
	};
}

interface GoogleError {
	status?: unknown;
	code?: unknown;
	errors?: { reason?: string }[];
	response?: { data?: { error?: { errors?: { reason?: string }[] } } };
}

function statusOf(error: unknown): number | undefined {
	const { status, code } = (error ?? {}) as GoogleError;
	if (typeof status === "number") return status;
	return typeof code === "number" ? code : undefined;
}

function reasonOf(error: unknown): string {
	const failure = (error ?? {}) as GoogleError;
	return (
		failure.errors?.[0]?.reason ??
		failure.response?.data?.error?.errors?.[0]?.reason ??
		""
	);
}

export function eventGone(error: unknown): boolean {
	const status = statusOf(error);
	return status === 404 || status === 410;
}

export function eventExists(error: unknown): boolean {
	return statusOf(error) === 409;
}

export function eventChanged(error: unknown): boolean {
	return statusOf(error) === 412;
}

const BUSY_REASONS = new Set([
	"rateLimitExceeded",
	"userRateLimitExceeded",
	"quotaExceeded",
]);

function needsReconnect(): never {
	throw new CardUnavailable(
		"no_connector",
		"Google Calendar needs reconnecting",
		RECONNECT_GOOGLE,
	);
}

/** Google Calendar's API errors as the card states a person can act on; anything else stays an internal error. */
function mapError(error: unknown, writing: boolean): never {
	if (error instanceof CardUnavailable) throw error;
	const status = statusOf(error);
	const reason = reasonOf(error);
	const message = error instanceof Error ? error.message : String(error);
	if (status === 429 || BUSY_REASONS.has(reason)) {
		throw new CardUnavailable(
			"error",
			"Google Calendar is busy. Try again in a minute",
		);
	}
	if (eventGone(error)) {
		throw new CardUnavailable(
			"gone",
			"That event is no longer on the calendar",
		);
	}
	if (
		status === 401 ||
		reason === "insufficientPermissions" ||
		/unauthorized_client|invalid_grant|invalid_client|insufficient authentication scopes/i.test(
			message,
		)
	) {
		needsReconnect();
	}
	if (status === 403) {
		throw new CardUnavailable(
			"no_access",
			writing
				? "Google Calendar doesn't let you change that event"
				: "Google Calendar doesn't let you see that event",
		);
	}
	if (eventChanged(error)) {
		throw new CardUnavailable(
			"error",
			"The event changed while you were looking at it. Try again",
		);
	}
	if (status === 400) {
		throw new CardUnavailable("error", "Google Calendar refused that change");
	}
	throw error;
}

export const calendarReadError = (error: unknown): never =>
	mapError(error, false);
export const calendarWriteError = (error: unknown): never =>
	mapError(error, true);
