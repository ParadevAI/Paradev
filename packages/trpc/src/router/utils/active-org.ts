import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";
import { verifyOrgMembership } from "../integration/utils";

type Session = NonNullable<TRPCContext["session"]>;

type ProtectedContext = {
	session: Session;
	activeOrganizationId: string | null;
};

export function requireActiveOrgId(
	ctx: ProtectedContext,
	message = "No active organization selected",
) {
	const organizationId = ctx.activeOrganizationId;

	if (!organizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message,
		});
	}

	return organizationId;
}

export function isOrgAdmin(orgRole: string): boolean {
	return orgRole === "owner" || orgRole === "admin";
}

/** The active organization, and whether the caller is one of its owners or admins. */
export async function requireActiveOrgRole(
	ctx: ProtectedContext,
	database?: Parameters<typeof verifyOrgMembership>[2],
) {
	const organizationId = requireActiveOrgId(ctx);
	const { membership } = await verifyOrgMembership(
		ctx.session.user.id,
		organizationId,
		database,
	);
	return { organizationId, isAdmin: isOrgAdmin(membership.role) };
}

export async function requireActiveOrgMembership(
	ctx: ProtectedContext,
	message?: string,
) {
	const organizationId = requireActiveOrgId(ctx, message);
	await verifyOrgMembership(ctx.session.user.id, organizationId);
	return organizationId;
}
