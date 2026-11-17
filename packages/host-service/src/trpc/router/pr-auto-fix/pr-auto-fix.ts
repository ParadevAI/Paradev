import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	PR_AUTO_FIX_MAX_ATTEMPTS,
	type PrAutoFixDescription,
	PrAutoFixError,
	type PrAutoFixWatch,
} from "../../../pr-auto-fix/index.ts";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import {
	findLinkedWorkspaceIds,
	findProjectPullRequestRows,
} from "../pull-requests/shared/linked-workspaces";

const targetSchema = z.object({
	prNumber: z.number().int().positive(),
	workspaceId: z.string().min(1).optional(),
	projectId: z.string().min(1).optional(),
});

type Target = z.infer<typeof targetSchema>;

export interface PrAutoFixTarget
	extends Omit<PrAutoFixDescription, "workspaceId"> {
	workspaceId: string | null;
}

const NO_WORKSPACE: PrAutoFixTarget = {
	workspaceId: null,
	watch: null,
	maxAttempts: PR_AUTO_FIX_MAX_ATTEMPTS,
	hasAgent: false,
	blocker: "not-linked",
};

async function resolveWorkspaceId(
	ctx: HostServiceContext,
	input: Target,
): Promise<string | null> {
	if (input.workspaceId) return input.workspaceId;
	if (!input.projectId) return null;
	const rows = await findProjectPullRequestRows(
		ctx,
		input.projectId,
		input.prNumber,
	);
	return (
		ctx.runtime.prAutoFix.ownerOf(rows.map((row) => row.url)) ??
		findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		)[0] ??
		null
	);
}

export const prAutoFixRouter = router({
	get: protectedProcedure
		.input(targetSchema)
		.query(async ({ ctx, input }): Promise<PrAutoFixTarget> => {
			const workspaceId = await resolveWorkspaceId(ctx, input);
			return workspaceId
				? ctx.runtime.prAutoFix.describe(workspaceId, input.prNumber)
				: NO_WORKSPACE;
		}),

	set: protectedProcedure
		.input(targetSchema.extend({ enabled: z.boolean() }))
		.mutation(async ({ ctx, input }): Promise<PrAutoFixTarget> => {
			const workspaceId = await resolveWorkspaceId(ctx, input);
			if (!workspaceId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "No workspace on this host is on that pull request",
				});
			}
			try {
				return ctx.runtime.prAutoFix.set({
					workspaceId,
					prNumber: input.prNumber,
					enabled: input.enabled,
				});
			} catch (error) {
				if (!(error instanceof PrAutoFixError)) throw error;
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: error.message,
					cause: error,
				});
			}
		}),

	list: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1).optional() }).optional())
		.query(({ ctx, input }): PrAutoFixWatch[] =>
			ctx.runtime.prAutoFix.list(input?.workspaceId),
		),
});
