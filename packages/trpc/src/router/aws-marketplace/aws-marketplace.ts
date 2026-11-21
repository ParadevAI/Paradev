import {
	awsMarketplaceClaim,
	linkAwsMarketplaceCustomer,
} from "@superset/auth/billing/aws-marketplace";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { personProcedure } from "../../trpc";

const claimToken = z.string().min(1).max(200);

export const awsMarketplaceRouter = {
	claim: personProcedure
		.input(z.object({ claimToken }))
		.query(({ ctx, input }) =>
			awsMarketplaceClaim(input.claimToken, ctx.session.user.id),
		),
	link: personProcedure
		.input(z.object({ claimToken, organizationId: z.string().uuid() }))
		.mutation(({ ctx, input }) =>
			linkAwsMarketplaceCustomer({
				claimToken: input.claimToken,
				organizationId: input.organizationId,
				userId: ctx.session.user.id,
			}),
		),
} satisfies TRPCRouterRecord;
