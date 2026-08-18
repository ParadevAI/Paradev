import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import {
	findTeamsConnection,
	getGraphAccessToken,
	isGraphAuthError,
} from "./graph";
import { listChannels, listTeams, listUsers } from "./resources";
import { deleteTeamsSubscriptions } from "./subscriptions";

/** How many teams' channel lists are fetched at once when building the
 * channel picker. Graph throttles per app per tenant; a tenant with hundreds
 * of teams is walked in batches rather than all at once. */
const CHANNEL_FETCH_CONCURRENCY = 5;

async function requireAccessToken(organizationId: string): Promise<{
	connectionId: string;
	accessToken: string;
} | null> {
	const connection = await findTeamsConnection(organizationId);
	if (!connection) return null;
	const accessToken = await getGraphAccessToken(connection.id);
	if (!accessToken) return null;
	return { connectionId: connection.id, accessToken };
}

export const microsoftTeamsRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "microsoft_teams"),
				),
				columns: {
					id: true,
					externalOrgId: true,
					externalOrgName: true,
					config: true,
					createdAt: true,
					disconnectedAt: true,
					disconnectReason: true,
				},
			});
			if (!connection || connection.disconnectedAt) return null;

			const config =
				connection.config?.provider === "microsoft_teams"
					? connection.config
					: null;
			return {
				id: connection.id,
				tenantId: connection.externalOrgId,
				externalOrgName: connection.externalOrgName,
				connectedAt: connection.createdAt,
				// Whether Graph is actually delivering: a connection whose
				// subscriptions never got created is consented but deaf.
				subscriptions: {
					channelMessages: config?.subscriptions.channelMessages ?? null,
					channels: config?.subscriptions.channels ?? null,
				},
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "microsoft_teams"),
				),
				columns: { id: true },
			});
			if (!connection) {
				return { success: false, error: "No connection found" };
			}

			// Before the row goes: the subscription ids live on it, and Graph
			// would otherwise keep posting to the notify route for two more days.
			await deleteTeamsSubscriptions(connection.id);
			await db
				.delete(integrationConnections)
				.where(eq(integrationConnections.id, connection.id));

			return { success: true };
		}),

	listTeams: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const auth = await requireAccessToken(input.organizationId);
			if (!auth) return [];

			const teams = await listTeams(auth.accessToken);
			return teams
				.map((team) => ({ id: team.id, label: team.displayName ?? team.id }))
				.sort((a, b) => a.label.localeCompare(b.label));
		}),

	listPeople: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const auth = await requireAccessToken(input.organizationId);
			if (!auth) return [];

			try {
				const users = await listUsers(auth.accessToken);
				return users
					.map((user) => ({
						id: user.id,
						label:
							user.displayName ??
							user.mail ??
							user.userPrincipalName ??
							user.id,
					}))
					.sort((a, b) => a.label.localeCompare(b.label));
			} catch (error) {
				// The tenant consented before User.ReadBasic.All was asked for: an
				// empty picker, not a red editor.
				if (!isGraphAuthError(error)) throw error;
				console.warn("[microsoft-teams] listPeople refused:", error);
				return [];
			}
		}),

	listChannels: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const auth = await requireAccessToken(input.organizationId);
			if (!auth) return [];

			const teams = await listTeams(auth.accessToken);
			const channels: Array<{ id: string; teamId: string; label: string }> = [];
			for (let i = 0; i < teams.length; i += CHANNEL_FETCH_CONCURRENCY) {
				const batch = teams.slice(i, i + CHANNEL_FETCH_CONCURRENCY);
				const results = await Promise.allSettled(
					batch.map(async (team) => {
						const list = await listChannels(auth.accessToken, team.id);
						return list.map((channel) => ({
							id: channel.id,
							teamId: team.id,
							// Channel names repeat across teams ("General" is in every
							// one), so the picker shows which team a channel belongs to.
							label: `${team.displayName ?? team.id} › ${channel.displayName ?? channel.id}`,
						}));
					}),
				);
				for (const result of results) {
					if (result.status === "fulfilled") channels.push(...result.value);
					else {
						console.error(
							"[microsoft-teams] listChannels failed for a team",
							result.reason,
						);
					}
				}
			}
			return channels.sort((a, b) => a.label.localeCompare(b.label));
		}),
} satisfies TRPCRouterRecord;
