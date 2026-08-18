import { db } from "@superset/db/client";
import {
	integrationConnections,
	userIdentities,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { listSlackChannels } from "./list-channels";

export const slackRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "slack"),
				),
				columns: {
					id: true,
					externalOrgName: true,
					createdAt: true,
				},
			});

			if (!connection) return null;

			return {
				id: connection.id,
				externalOrgName: connection.externalOrgName,
				connectedAt: connection.createdAt,
			};
		}),

	/** Channels the trigger editor can scope a Slack trigger to. */
	listChannels: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "slack"),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { accessToken: true },
			});
			if (!connection) return [];

			return listSlackChannels(connection.accessToken);
		}),

	/**
	 * People in this organization who have linked a Slack account, keyed by
	 * Slack user id — what the matcher compares an event's `user` against.
	 */
	listLinkedPeople: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// A Slack user id is only unique within a workspace, so only identities
			// from the connected workspace can ever match an event from it.
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "slack"),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { externalOrgId: true },
			});
			if (!connection?.externalOrgId) return [];

			const rows = await db
				.select({
					slackUserId: userIdentities.externalId,
					handle: userIdentities.handle,
					displayName: userIdentities.displayName,
					name: users.name,
					email: users.email,
				})
				.from(userIdentities)
				.innerJoin(users, eq(users.id, userIdentities.userId))
				.where(
					and(
						eq(userIdentities.organizationId, input.organizationId),
						eq(userIdentities.provider, "slack"),
						eq(userIdentities.externalScopeId, connection.externalOrgId),
					),
				);

			return rows.map((row) => ({
				id: row.slackUserId,
				label: row.displayName ?? row.handle ?? row.name ?? row.email,
			}));
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await db
				.delete(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "slack"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
