import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { accounts, users } from "@superset/db/schema";
import { isTestAccountEmail } from "@superset/shared/constants";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { purgeAccount } from "../../lib/account-purge";
import { adminProcedure } from "../../trpc";

export const adminRouter = {
	/** Support's purge path for deletion requests made by email; the daily
	 * job covers requests made in the app. Does not refuse a user who is the
	 * only owner of a shared organization — that call is support's. */
	deleteUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			await purgeAccount(input.userId);
			return { success: true };
		}),

	/** Resets the scheduled production onboarding walkthrough: its account
	 * otherwise sits in the 30-day deletion window and the next sign-in
	 * restores it instead of signing up. Refuses any non-test address. */
	purgeTestAccount: adminProcedure
		.input(z.object({ email: z.string().email() }))
		.mutation(async ({ input }) => {
			const email = input.email.toLowerCase();
			if (!isTestAccountEmail(email)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only test-account addresses can be purged this way.",
				});
			}
			const user = await db.query.users.findFirst({
				columns: { id: true },
				where: eq(users.email, email),
			});
			if (!user) return { purged: false };
			await purgeAccount(user.id);
			return { purged: true };
		}),

	/** Sets an email+password credential on the signed-in admin's own account
	 * through Better Auth's hasher (scrypt, salted — never write the
	 * accounts.password column directly), so OAuth-only accounts can also
	 * sign in with a password (e.g. mobile dev builds where OAuth is
	 * unavailable).
	 *
	 * Hand-composed because Better Auth has no upsert for this:
	 * `auth.api.setPassword` throws PASSWORD_ALREADY_SET on existing
	 * credentials, and the admin plugin's `setUserPassword` is update-only
	 * (and we don't run that plugin). Both endpoints internally use exactly
	 * these `context.password.hash` + `internalAdapter` calls. */
	setMyPassword: adminProcedure
		.input(z.object({ password: z.string().min(8) }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const context = await auth.$context;
			const passwordHash = await context.password.hash(input.password);

			const credential = await db.query.accounts.findFirst({
				where: and(
					eq(accounts.userId, userId),
					eq(accounts.providerId, "credential"),
				),
			});
			if (credential) {
				await context.internalAdapter.updatePassword(userId, passwordHash);
			} else {
				await context.internalAdapter.createAccount({
					userId,
					providerId: "credential",
					accountId: userId,
					password: passwordHash,
				});
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
