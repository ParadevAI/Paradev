import { db } from "@superset/db/client";
import { accounts, members, subscriptions, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "./server";

/** Seeds the App Store review demo account: credential sign-in, onboarded,
 * and a Pro-subscribed personal org (subscription row only — no Stripe
 * charge). Idempotent; safe to re-run to rotate the password. Sign-up stays
 * disabled in production, so this raw path is the only way the account can
 * exist there.
 *
 *   APP_REVIEW_EMAIL=... APP_REVIEW_PASSWORD=... bun run db:seed-review
 */
async function seedReviewAccount(): Promise<void> {
	const email = process.env.APP_REVIEW_EMAIL;
	const password = process.env.APP_REVIEW_PASSWORD;
	if (!email || !password) {
		throw new Error("APP_REVIEW_EMAIL and APP_REVIEW_PASSWORD are required");
	}
	if (password.length < 8) {
		throw new Error("APP_REVIEW_PASSWORD must be at least 8 characters");
	}

	const context = await auth.$context;

	let user = await db.query.users.findFirst({ where: eq(users.email, email) });
	if (!user) {
		[user] = await db
			.insert(users)
			.values({ name: "App Review", email, emailVerified: true })
			.returning();
		console.log(`Created review user: ${email}`);
	}
	if (!user) throw new Error("review user was not created");

	const passwordHash = await context.password.hash(password);
	const credential = await db.query.accounts.findFirst({
		where: and(
			eq(accounts.userId, user.id),
			eq(accounts.providerId, "credential"),
		),
	});
	if (credential) {
		await context.internalAdapter.updatePassword(user.id, passwordHash);
	} else {
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: "credential",
			accountId: user.id,
			password: passwordHash,
		});
	}

	await db
		.update(users)
		.set({ onboardedAt: new Date(), deletionRequestedAt: null })
		.where(eq(users.id, user.id));

	let membership = await db.query.members.findFirst({
		where: eq(members.userId, user.id),
	});
	if (!membership) {
		// Raw user inserts bypass the user-create database hook, so the
		// personal org has to be created explicitly.
		await auth.api.createOrganization({
			body: {
				name: "App Review Team",
				slug: `${user.id.slice(0, 8)}-review`,
				userId: user.id,
			},
		});
		membership = await db.query.members.findFirst({
			where: eq(members.userId, user.id),
		});
	}
	if (!membership) throw new Error("review user has no organization");

	const activeSubscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, membership.organizationId),
			eq(subscriptions.status, "active"),
		),
	});
	if (!activeSubscription) {
		await db.insert(subscriptions).values({
			plan: "pro",
			referenceId: membership.organizationId,
			status: "active",
			billingInterval: "monthly",
			seats: 1,
		});
	}

	console.log(`Review account ready: ${email} (onboarded, pro)`);
}

seedReviewAccount()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("seed-review-account failed:", error);
		process.exit(1);
	});
