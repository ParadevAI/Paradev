import { updateTaskSchema } from "@superset/trpc";
import { apiClient } from "main/lib/api-client";
import { publicProcedure, router } from "../..";

export const createTasksRouter = () => {
	return router({
		update: publicProcedure
			.input(updateTaskSchema)
			.mutation(async ({ input }) => {
				const result = await apiClient.task.update.mutate(input);
				return result;
			}),
	});
};
