import { observable } from "@trpc/server/observable";
import {
	type WorkspaceViewChange,
	workspaceViews,
} from "main/lib/workspace-views";
import { workspaceViewSchema } from "shared/workspace-views";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createWorkspaceViewsRouter = () => {
	return router({
		list: publicProcedure.query(() => workspaceViews.list()),

		onChange: publicProcedure.subscription(() => {
			return observable<WorkspaceViewChange>((emit) => {
				const handler = (change: WorkspaceViewChange) => emit.next(change);
				workspaceViews.on("change", handler);
				return () => {
					workspaceViews.off("change", handler);
				};
			});
		}),

		put: publicProcedure.input(workspaceViewSchema).mutation(({ input }) => {
			workspaceViews.put(input);
			return { success: true };
		}),

		patch: publicProcedure
			.input(
				workspaceViewSchema.pick({ workspaceId: true }).extend({
					mainArea: workspaceViewSchema.shape.mainArea.optional(),
					rightPane: workspaceViewSchema.shape.rightPane.optional(),
				}),
			)
			.mutation(({ input }) => {
				workspaceViews.patch(input);
				return { success: true };
			}),

		remove: publicProcedure
			.input(z.object({ workspaceId: z.string().min(1) }))
			.mutation(({ input }) => {
				workspaceViews.remove(input.workspaceId);
				return { success: true };
			}),
	});
};
