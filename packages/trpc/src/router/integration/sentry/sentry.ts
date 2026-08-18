import { db } from "@superset/db/client";
import { integrationConnections, type SentryConfig } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import { fetchSentryProjects, getSentryAccessToken, SENTRY_URL } from "./utils";

/**
 * A Sentry connection is a public integration the org installs through Sentry's
 * OAuth flow — the connect/callback routes under `apps/api` do the install and
 * token exchange. This router is the read/manage surface the editor and the
 * settings page use.
 */
export const sentryRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "sentry"),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: {
					id: true,
					externalOrgId: true,
					externalOrgName: true,
					createdAt: true,
				},
			});

			if (!connection) return null;

			return {
				id: connection.id,
				organizationSlug: connection.externalOrgId,
				organizationName: connection.externalOrgName,
				connectedAt: connection.createdAt,
			};
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
						eq(integrationConnections.provider, "sentry"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	/** The org's Sentry projects, as the trigger editor's project chip lists them. */
	listProjects: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "sentry"),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { id: true, externalOrgId: true, config: true },
			});
			if (!connection?.externalOrgId) return [];

			const token = await getSentryAccessToken(connection.id);
			if (token.disconnected) return [];

			const config = connection.config as SentryConfig | null;
			const projects = await fetchSentryProjects(
				config?.regionUrl ?? SENTRY_URL,
				connection.externalOrgId,
				token.accessToken,
			);
			return projects.map((project) => ({
				id: project.id,
				slug: project.slug,
				name: project.name,
			}));
		}),
} satisfies TRPCRouterRecord;
