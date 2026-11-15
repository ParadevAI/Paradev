import { db } from "@superset/db/client";
import {
	connections,
	type GoogleConfig,
	type SelectConnection,
} from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";
import {
	connectionById,
	userConnection,
	userConnections,
} from "../../../lib/connectors";
import { GMAIL_READ_SCOPES } from "./constants";

/**
 * The per-connection sync state lives in `connections.state`, plaintext beside
 * the encrypted `config`. Writes are a jsonb merge in SQL rather than a
 * read-modify-write in JavaScript, so a concurrent write cannot undo another.
 */

export function googleConfigOf(state: unknown): GoogleConfig {
	if (state && typeof state === "object" && "provider" in state) {
		const candidate = state as { provider?: string };
		if (candidate.provider === "google") return state as GoogleConfig;
	}
	return { provider: "google" };
}

/**
 * One member's active Google connection in an org, or null. Throws when the
 * member has several, so callers that need one account never pick for them.
 */
export async function findGoogleConnection(
	organizationId: string,
	userId: string,
): Promise<SelectConnection | null> {
	return userConnection(organizationId, "google", userId);
}

/** All of one member's live Google connections in an org, newest first. */
export async function findGoogleConnections(
	organizationId: string,
	userId: string,
): Promise<SelectConnection[]> {
	return userConnections(organizationId, "google", userId);
}

/**
 * The status view of a member's Google connections, newest first. Any live
 * connection counts as connected; a reconnect is needed only when none is live.
 */
export function summarizeGoogleConnections(rows: SelectConnection[]) {
	const live = rows.filter((row) => row.disconnectedAt === null);
	const primary = live[0] ?? rows[0];
	if (!primary) return null;
	return {
		id: primary.id,
		email: primary.externalAccountId,
		emails: live.map((row) => row.externalAccountId),
		connectedByUserId: primary.connectedByUserId,
		connectedAt: primary.createdAt,
		needsReconnect: live.length === 0,
	};
}

export async function findGoogleConnectionById(
	connectionId: string,
): Promise<SelectConnection | null> {
	return connectionById(connectionId, {
		connector: "google",
		includeDisconnected: true,
	});
}

export async function patchGmailState(
	connectionId: string,
	patch: NonNullable<GoogleConfig["gmail"]>,
): Promise<void> {
	const json = JSON.stringify(patch);
	await db
		.update(connections)
		.set({
			state: sql`jsonb_set(
				coalesce(${connections.state}, '{}'::jsonb) || '{"provider":"google"}'::jsonb,
				'{gmail}',
				coalesce(${connections.state} -> 'gmail', '{}'::jsonb) || ${json}::jsonb
			)`,
		})
		.where(eq(connections.id, connectionId));
}

/** Rows migrated from the legacy table carry no scopes; that flow required Gmail. */
export function canReadGmail(scopes: string[] | null): boolean {
	if (!scopes) return true;
	return GMAIL_READ_SCOPES.some((scope) => scopes.includes(scope));
}
