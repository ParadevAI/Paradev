import { TRPCError } from "@trpc/server";
import { onBehalfOf, type Principal } from "../../principal";
import { verifyOrgMembership } from "../integration/utils";

export interface PageCaller {
	organizationId: string;
	/** The person a new page is recorded as: the caller, or the person a Dev works for. */
	userId: string;
	/** Whose access reads and changes existing pages; null when the caller has none. */
	reader: string | null;
}

/**
 * A Dev owns no pages, so it uses its owner's access when the owner asks.
 * For anyone else it may only make new pages for them.
 */
export async function pageCaller(ctx: {
	principal: Principal;
	activeOrganizationId: string | null;
}): Promise<PageCaller> {
	const organizationId = ctx.activeOrganizationId;
	if (!organizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "No active organization selected",
		});
	}
	const { principal } = ctx;
	const userId = onBehalfOf(principal);
	await verifyOrgMembership(userId, organizationId);
	const reader =
		principal.kind === "person" || principal.askerId === principal.ownerId
			? userId
			: null;
	return { organizationId, userId, reader };
}

export const noPageAccess = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message:
			"Page not found. A Dev reads and changes pages only for its owner; for anyone else it can only make new ones.",
	});

export function pageReader(caller: PageCaller): string {
	if (!caller.reader) throw noPageAccess();
	return caller.reader;
}
