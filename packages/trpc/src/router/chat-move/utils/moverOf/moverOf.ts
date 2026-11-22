import { TRPCError } from "@trpc/server";
import { requireActiveOrgMembership } from "../../../utils/active-org";

type ProtectedCtx = Parameters<typeof requireActiveOrgMembership>[0] & {
	sandboxCaller: unknown;
};

export type Mover = { organizationId: string; userId: string };

/** The person moving a workspace or chat; a box cannot start or run a move. */
export async function moverOf(ctx: ProtectedCtx): Promise<Mover> {
	if (ctx.sandboxCaller) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "A cloud workspace cannot move chats",
		});
	}
	return {
		organizationId: await requireActiveOrgMembership(ctx),
		userId: ctx.session.user.id,
	};
}
