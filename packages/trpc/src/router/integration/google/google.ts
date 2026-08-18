import { db } from "@superset/db/client";
import {
	integrationConnections,
	userIdentities,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { listCalendars, stopChannel } from "./calendar";
import { listLabels, stopMailboxWatch } from "./gmail";
import { findGoogleConnection, googleConfigOf } from "./state";

export const googleRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// The caller's own connection: Google is per member, so another
			// member's account is not this person's to see or manage.
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "google"),
					eq(integrationConnections.connectedByUserId, ctx.session.user.id),
				),
				columns: {
					id: true,
					externalOrgId: true,
					connectedByUserId: true,
					disconnectedAt: true,
					disconnectReason: true,
					createdAt: true,
				},
			});
			if (!connection) return null;

			return {
				id: connection.id,
				// The Google account's address; the connection is that person's
				// calendars and mailbox, not the organization's.
				email: connection.externalOrgId,
				connectedByUserId: connection.connectedByUserId,
				connectedAt: connection.createdAt,
				needsReconnect: connection.disconnectedAt !== null,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await findGoogleConnection(
				input.organizationId,
				ctx.session.user.id,
			);
			if (connection) {
				// Best effort: Google keeps pushing to a channel until it is stopped
				// or expires, and the push route would only reject those with a
				// missing connection. A failure here must not block the disconnect.
				const config = googleConfigOf(connection.config);
				await Promise.allSettled([
					// The grant outlives the row unless it is revoked: without this
					// the refresh token would be gone from our side and the app would
					// still hold read access on Google's.
					revokeGrant(connection.refreshToken ?? connection.accessToken),
					...Object.values(config.calendars ?? {}).flatMap((state) =>
						state.channelId && state.resourceId
							? [
									stopChannel(connection.id, {
										id: state.channelId,
										resourceId: state.resourceId,
									}),
								]
							: [],
					),
					config.gmail?.watchExpiresAt
						? stopMailboxWatch(connection.id)
						: Promise.resolve(),
				]);
			}

			const result = await db
				.delete(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "google"),
						eq(integrationConnections.connectedByUserId, ctx.session.user.id),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}
			return { success: true };
		}),

	/** The connected account's calendars, as scope options. */
	listCalendars: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await findGoogleConnection(
				input.organizationId,
				ctx.session.user.id,
			);
			if (!connection) return [];
			const calendars = await listCalendars(connection.id);
			return calendars
				.filter((calendar) => !calendar.deleted)
				.map((calendar) => ({
					id: calendar.id,
					label: calendar.primary
						? `${calendar.summary ?? calendar.id} (primary)`
						: (calendar.summary ?? calendar.id),
				}));
		}),

	/** The connected mailbox's labels. Ids, since names can be renamed. */
	listLabels: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await findGoogleConnection(
				input.organizationId,
				ctx.session.user.id,
			);
			if (!connection) return [];
			const labels = await listLabels(connection.id);
			return (
				labels
					// Gmail's internal category and chat labels are noise in a picker.
					.filter((label) => !label.id.startsWith("CATEGORY_"))
					.map((label) => ({ id: label.id, label: label.name }))
			);
		}),

	/**
	 * People an attendee filter can name, as Google addresses. Org members who
	 * have connected or linked a Google account; the id is the address because
	 * that is what a calendar event names people by.
	 */
	listLinkedPeople: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const rows = await db
				.select({
					email: userIdentities.externalId,
					name: users.name,
				})
				.from(userIdentities)
				.innerJoin(users, eq(users.id, userIdentities.userId))
				.where(
					and(
						eq(userIdentities.organizationId, input.organizationId),
						eq(userIdentities.provider, "google"),
					),
				);

			return rows.map((row) => ({
				id: row.email.toLowerCase(),
				label: row.name ? `${row.name} (${row.email})` : row.email,
			}));
		}),
} satisfies TRPCRouterRecord;

async function revokeGrant(token: string): Promise<void> {
	await fetch(
		`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
		{ method: "POST", signal: AbortSignal.timeout(10_000) },
	);
}
