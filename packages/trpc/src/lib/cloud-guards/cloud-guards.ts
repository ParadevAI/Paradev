import { organizationBilling } from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { posthog } from "../analytics";
import type { SandboxCaller } from "../sandbox/api-credential";
import { tokenOrganizationIds } from "../token-organizations";

interface CloudAccessContext {
	principal: { userId: string };
	session: { user: { id: string; email: string } } | null;
}

/**
 * Gate every cloud-sandbox procedure — workspaces, environments, secrets — on
 * the flag the clients already hide the Cloud option behind, so the allowlist
 * lives in its release conditions rather than the repository.
 *
 * Not `cloud-access`, despite the name: that one resolves to a broad cohort of
 * mostly external accounts, and sandboxes bill by the hour with no idle-stop.
 *
 * Fails closed — `isFeatureEnabled` resolves undefined when PostHog is
 * unreachable, so an outage suspends cloud access rather than opening it.
 */
export async function assertCloudAccess(
	ctx: CloudAccessContext,
	organizationId: string | null,
): Promise<void> {
	const { enabled, account } = await cloudAccess(ctx, organizationId);
	if (enabled) return;

	throw userError({
		code: "FORBIDDEN",
		message: `Cloud workspaces are not enabled for ${account || "this account"}. They come with the Team and Ultra plans: upgrade in Settings, Billing.`,
		i18nKey: "serverError.cloudWorkspace.cloudSandboxesAreInternalOnly",
		params: { account: account || "this account" },
	});
}

/** `enabled` is undefined when PostHog could not answer. */
export async function cloudAccess(
	ctx: CloudAccessContext,
	organizationId: string | null,
): Promise<{ enabled: boolean | undefined; account: string }> {
	const [email, planTier] = await Promise.all([
		currentEmail(ctx),
		organizationId
			? organizationBilling(organizationId)
					.then((billing) => billing.planTier)
					.catch(() => "unknown")
			: "none",
	]);
	const account = email?.trim().toLowerCase() ?? "";
	const enabled = await posthog.isFeatureEnabled(
		FEATURE_FLAGS.CLOUD_WORKSPACES,
		ctx.principal.userId,
		{
			// Sent explicitly: the conditions are email-based, and a person
			// PostHog has not seen yet would otherwise be refused for the wrong
			// reason. No exposure events — this is authorization, not an experiment.
			personProperties: {
				email: account,
				plan_tier: planTier,
			},
			sendFeatureFlagEvents: false,
		},
	);
	return { enabled, account };
}

/**
 * The context has already loaded this user's row — `getSession`, or
 * `sessionFromOAuthBearer` for a bearer — so read it there rather than
 * spending a second query on it. Only a session describing somebody else
 * (a cookie and a bearer disagreeing) needs the lookup.
 */
async function currentEmail(ctx: CloudAccessContext): Promise<string | null> {
	const { userId } = ctx.principal;
	if (ctx.session?.user.id === userId) return ctx.session.user.email;
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { email: true },
	});
	return user?.email ?? null;
}

export interface MemberContext {
	principal: { userId: string };
	session: { session: object } | null;
	activeOrganizationId: string | null;
	sandboxCaller: SandboxCaller | null;
}

/**
 * Whether the caller belongs to the organization. The organization this
 * request already checked, or one a bearer's token lists, needs no query; an
 * organization joined since the token was minted is looked up. A box acts
 * only in its own.
 */
export async function isMember(
	ctx: MemberContext,
	organizationId: string,
): Promise<boolean> {
	if (
		ctx.sandboxCaller &&
		ctx.sandboxCaller.organizationId !== organizationId
	) {
		return false;
	}
	if (organizationId === ctx.activeOrganizationId) return true;
	if (tokenOrganizationIds(ctx.session)?.includes(organizationId)) return true;
	return Boolean(
		await findOrgMembership({ userId: ctx.principal.userId, organizationId }),
	);
}

/**
 * The organization a request acts in. A bearer that names none gets its
 * token's first, as the routes released clients call before naming one expect.
 */
export function organizationOrFirst(ctx: MemberContext): string | null {
	return (
		ctx.activeOrganizationId ?? tokenOrganizationIds(ctx.session)?.[0] ?? null
	);
}

export async function assertMember(
	ctx: MemberContext,
	organizationId: string,
): Promise<void> {
	if (!(await isMember(ctx, organizationId))) {
		throw userError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
			i18nKey: "serverError.cloudWorkspace.notAMemberOfThisOrganization",
		});
	}
}
