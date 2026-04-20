import type { auth, Session } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import {
	isActiveSubscriptionStatus,
	isPaidPlan,
	type PlanTier,
} from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

export type TRPCContext = {
	session: Session | null;
	auth: typeof auth;
	headers: Headers;
};

export const createTRPCContext = (opts: TRPCContext): TRPCContext => opts;

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

export const createTRPCRouter = t.router;

export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated. Please sign in.",
		});
	}

	return next({ ctx: { session: ctx.session } });
});

export const jwtProcedure = t.procedure.use(async ({ ctx, next }) => {
	const authHeader = ctx.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "JWT bearer token required",
		});
	}

	const token = authHeader.slice(7);
	try {
		const { payload } = await ctx.auth.api.verifyJWT({ body: { token } });
		if (!payload?.sub) {
			throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid JWT" });
		}

		const organizationIds = (payload.organizationIds as string[]) ?? [];
		return next({
			ctx: {
				userId: payload.sub,
				email: (payload.email as string) ?? "",
				organizationIds,
				activeOrganizationId: organizationIds[0] ?? null,
			},
		});
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "JWT verification failed",
		});
	}
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	if (!ctx.session.user.email.endsWith(COMPANY.EMAIL_DOMAIN)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Admin access requires ${COMPANY.EMAIL_DOMAIN} email.`,
		});
	}

	return next({ ctx });
});

/**
 * Resolves the plan tier for the session's active organization.
 * Returns "free" when no active/trialing subscription exists.
 */
export async function getCurrentPlan(
	activeOrganizationId: string | null | undefined,
): Promise<PlanTier> {
	if (!activeOrganizationId) return "free";

	const subscription = await db.query.subscriptions.findFirst({
		where: eq(subscriptions.referenceId, activeOrganizationId),
	});

	if (!subscription) return "free";
	if (!isActiveSubscriptionStatus(subscription.status)) return "free";

	const plan = subscription.plan;
	if (plan === "pro" || plan === "enterprise") return plan;
	return "free";
}

/**
 * Gates features to orgs on a paid tier. Requires an active/trialing
 * subscription with plan != "free".
 */
export const paidPlanProcedure = protectedProcedure.use(
	async ({ ctx, next }) => {
		const plan = await getCurrentPlan(ctx.session.session.activeOrganizationId);

		if (!isPaidPlan(plan)) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "This feature requires a paid plan.",
			});
		}

		return next({ ctx: { ...ctx, plan } });
	},
);
