import { connections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userConnections } from "../../../lib/connectors";
import { deleteGoogleConnections } from "../../../lib/connectors/disconnect";
import { personProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import { summarizeGoogleConnections } from "./state";

export const googleRouter = {
	getConnection: personProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// The caller's own connections: Google is per member, so another
			// member's account is not this person's to see or manage.
			return summarizeGoogleConnections(
				await userConnections(
					input.organizationId,
					"google",
					ctx.session.user.id,
					{ includeDisconnected: true },
				),
			);
		}),

	disconnect: personProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const result = await deleteGoogleConnections([
				eq(connections.organizationId, input.organizationId),
				eq(connections.connectedByUserId, ctx.session.user.id),
			]);

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
