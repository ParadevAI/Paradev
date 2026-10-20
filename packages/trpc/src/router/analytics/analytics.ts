import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { acpChatEnabled } from "../../lib/acp-chat";
import { posthog } from "../../lib/analytics";
import { protectedProcedure } from "../../trpc";

export const analyticsRouter = {
	acpChatEnabled: protectedProcedure
		.input(z.object({ userId: z.string().optional() }))
		.query(async ({ ctx, input }) => {
			const userId = input.userId ?? ctx.session.user.id;
			if (userId !== ctx.session.user.id) {
				if (!ctx.activeOrganizationId) {
					throw new TRPCError({ code: "FORBIDDEN" });
				}
				const membership = await db.query.members.findFirst({
					where: and(
						eq(members.organizationId, ctx.activeOrganizationId),
						eq(members.userId, userId),
					),
					columns: { id: true },
				});
				if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
			}
			return { enabled: await acpChatEnabled(userId) };
		}),
	captureEvent: protectedProcedure
		.input(
			z.object({
				source: z.string().min(1).max(50),
				event: z.string().min(1).max(200),
				properties: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const augmented = ctx.session.session as typeof ctx.session.session & {
				plan?: string | null;
			};
			posthog.capture({
				distinctId: ctx.session.user.id,
				event: input.event,
				properties: {
					...(input.properties ?? {}),
					source: input.source,
					plan: augmented.plan ?? null,
					active_organization_id: ctx.activeOrganizationId,
				},
				groups: ctx.activeOrganizationId
					? { organization: ctx.activeOrganizationId }
					: undefined,
			});
			return { ok: true };
		}),

	// Server-side feature-flag payload lookup for the authenticated user. Lets
	// clients without a PostHog SDK (e.g. the CLI binary) evaluate flags
	// without us baking the PostHog project key into their build. Returns
	// `null` when the flag is off or has no payload configured.
	featureFlagPayload: protectedProcedure
		.input(z.object({ key: z.string().min(1).max(100) }))
		.query(async ({ ctx, input }) => {
			try {
				const payload = await posthog.getFeatureFlagPayload(
					input.key,
					ctx.session.user.id,
				);
				return payload ?? null;
			} catch {
				return null;
			}
		}),
} satisfies TRPCRouterRecord;
