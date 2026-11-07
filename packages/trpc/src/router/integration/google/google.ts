import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	decryptOptional,
	decryptSecret,
	userConnections,
} from "../../../lib/connectors";
import { personProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { googleConnectionStatus } from "./connection-status";
import { stopMailboxWatch } from "./gmail";
import { googleConfigOf } from "./state";

export const googleRouter = {
	getConnection: personProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// The caller's own connection: Google is per member, so another
			// member's account is not this person's to see or manage. Every row is
			// read rather than exactly one: a member can hold two (a second account,
			// or a disconnected row beside a live one), and a status page must still
			// render for them instead of failing on the ambiguity.
			const rows = await userConnections(
				input.organizationId,
				"google",
				ctx.session.user.id,
				{ includeDisconnected: true },
			);
			return googleConnectionStatus(rows);
		}),

	disconnect: personProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// Every live row the delete below removes, not exactly one: a member
			// with two accounts would otherwise fail here on the ambiguity, and the
			// second account's grant and watch would outlive its row.
			const live = await userConnections(
				input.organizationId,
				"google",
				ctx.session.user.id,
			);
			// Best effort: Google keeps pushing until the watch is stopped or
			// expires, and the push route would only reject pushes for a missing
			// connection. A failure here must not block the disconnect.
			await Promise.allSettled(
				live.flatMap((connection) => {
					const config = googleConfigOf(connection.state);
					return [
						// The grant outlives the row unless it is revoked: without this
						// the refresh token would be gone from our side and the app would
						// still hold read access on Google's.
						(async () =>
							revokeGrant(
								(await decryptOptional(connection.refreshToken)) ??
									(await decryptSecret(connection.accessToken)),
							))(),
						config.gmail?.watchExpiresAt
							? stopMailboxWatch(connection.id)
							: Promise.resolve(),
					];
				}),
			);

			const result = await db
				.delete(connections)
				.where(
					and(
						eq(connections.organizationId, input.organizationId),
						eq(connections.connector, "google"),
						eq(connections.connectedByUserId, ctx.session.user.id),
					),
				)
				.returning({ id: connections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

async function revokeGrant(token: string): Promise<void> {
	await fetch(
		`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
		{ method: "POST", signal: AbortSignal.timeout(10_000) },
	);
}
