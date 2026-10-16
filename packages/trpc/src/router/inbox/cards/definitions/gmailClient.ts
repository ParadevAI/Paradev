import { gmail, type gmail_v1 } from "@googleapis/gmail";
import {
	AmbiguousConnectionError,
	userConnection,
} from "../../../../lib/connectors/lookup";
import { googleAuthFor } from "../../../integration/google/auth";
import {
	GOOGLE_API_TIMEOUT_MS,
	gmailAccess,
} from "../../../integration/google/constants";
import { CardUnavailable } from "../types";

export const CONNECT_GOOGLE = {
	label: "Connect Google",
	href: "#/settings/integrations",
};

export interface GmailAccount {
	client: gmail_v1.Gmail;
	connectionId: string;
	canSend: boolean;
	canArchive: boolean;
}

/** Gmail is one person's, so only the reader's own connection fits. */
export async function gmailFor(
	organizationId: string,
	userId: string,
): Promise<GmailAccount> {
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
			"Connect Gmail to see this",
			CONNECT_GOOGLE,
		);
	}
	let auth: Awaited<ReturnType<typeof googleAuthFor>>;
	try {
		auth = await googleAuthFor(connection.id);
	} catch {
		throw new CardUnavailable(
			"no_connector",
			"Gmail needs reconnecting",
			CONNECT_GOOGLE,
		);
	}
	return {
		client: gmail({ version: "v1", auth, timeout: GOOGLE_API_TIMEOUT_MS }),
		connectionId: connection.id,
		...gmailAccess(connection.scopes ?? []),
	};
}

function statusOf(error: unknown): number | undefined {
	const { status, code } = (error ?? {}) as {
		status?: unknown;
		code?: unknown;
	};
	if (typeof status === "number") return status;
	return typeof code === "number" ? code : undefined;
}

/** Google's API errors as the card states a person can act on; anything else stays an internal error. */
export function reconnectOnAuthError(error: unknown): never {
	const status = statusOf(error);
	const message = error instanceof Error ? error.message : String(error);
	if (status === 429 || (status === 403 && /rate ?limit/i.test(message))) {
		throw new CardUnavailable("error", "Gmail is busy. Try again in a minute");
	}
	if (
		status === 401 ||
		status === 403 ||
		/unauthorized_client|invalid_grant|invalid_client/.test(message)
	) {
		throw new CardUnavailable(
			"no_connector",
			"Gmail needs reconnecting",
			CONNECT_GOOGLE,
		);
	}
	if (status === 400) {
		throw new CardUnavailable("error", "Gmail refused that email");
	}
	throw error;
}

export function notFound(error: unknown): boolean {
	return statusOf(error) === 404;
}
