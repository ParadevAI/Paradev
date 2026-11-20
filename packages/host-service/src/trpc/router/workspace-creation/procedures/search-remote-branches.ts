import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { listRemoteBranchNames } from "../utils/list-remote-branch-names";

/**
 * Branches for a repo the user may not have checked out, read through `gh`
 * so it uses their own `gh auth login` — the same path issue and PR lookups
 * take. Cloud workspaces need this: the sandbox is the only checkout, so
 * there is no local repo for `searchBranches` to enumerate.
 */
export const searchRemoteBranches = protectedProcedure
	.input(
		z.object({
			owner: z.string().min(1),
			repo: z.string().min(1),
		}),
	)
	.query(async ({ ctx, input }) => {
		let names: string[];
		try {
			names = await listRemoteBranchNames(ctx.execGh, input.owner, input.repo);
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unexpected branch payload from gh",
				});
			}
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message:
					"Could not list branches from GitHub. Check `gh auth status` on this device.",
				cause: error,
			});
		}

		return { items: names.sort((a, b) => a.localeCompare(b)) };
	});
