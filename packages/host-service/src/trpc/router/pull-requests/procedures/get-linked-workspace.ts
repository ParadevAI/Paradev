import { z } from "zod";
import { protectedProcedure } from "../../../index";
import {
	findLinkedWorkspaceIds,
	findProjectPullRequestRows,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

/**
 * Whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one.
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		const rows = await findProjectPullRequestRows(
			ctx,
			input.projectId,
			input.prNumber,
		);
		const [workspaceId = null] = findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		);
		return { workspaceId };
	});
