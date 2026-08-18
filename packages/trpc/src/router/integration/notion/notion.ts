import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import {
	listDataSources,
	listUsers,
	NotionApiError,
	plainText,
} from "./client";

/**
 * A picker with nothing in it beats a picker that errors: a token without the
 * matching capability (or a personal token, which cannot list users) leaves
 * the chip on its "anyone / me" entries rather than the whole editor red.
 */
async function listOrEmpty<T>(list: () => Promise<T[]>): Promise<T[]> {
	try {
		return await list();
	} catch (error) {
		if (error instanceof NotionApiError && error.permanent) {
			console.warn("[integration.notion] list refused:", error.message);
			return [];
		}
		throw error;
	}
}

async function activeConnection(organizationId: string) {
	return db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "notion"),
			isNull(integrationConnections.disconnectedAt),
		),
		columns: { id: true, accessToken: true, externalOrgName: true },
	});
}

export const notionRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "notion"),
					isNull(integrationConnections.disconnectedAt),
				),
				columns: { id: true, externalOrgName: true, createdAt: true },
			});

			if (!connection) return null;

			return {
				id: connection.id,
				externalOrgName: connection.externalOrgName,
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
						eq(integrationConnections.provider, "notion"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	/**
	 * The data sources the workspace has shared with the integration, for the
	 * trigger editor's scope chip. Ids, not titles: a title can be renamed.
	 */
	listDataSources: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await activeConnection(input.organizationId);
			if (!connection) return [];

			const dataSources = await listOrEmpty(() =>
				listDataSources(connection.accessToken),
			);
			return dataSources.map((source) => ({
				id: source.id,
				label: plainText(source.title) || "Untitled",
			}));
		}),

	/**
	 * The people in the connected workspace, for the actor and mention chips.
	 * Notion user ids, since that is what a comment's author and mentions carry.
	 */
	listUsers: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connection = await activeConnection(input.organizationId);
			if (!connection) return [];

			const users = await listOrEmpty(() => listUsers(connection.accessToken));
			return users.map((user) => ({
				id: user.id,
				label: user.name || user.person?.email || user.id,
			}));
		}),
} satisfies TRPCRouterRecord;
