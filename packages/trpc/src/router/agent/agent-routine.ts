import { db } from "@superset/db/client";
import { agentRoutines, type SelectAgentRoutine } from "@superset/db/schema";
import {
	routineFieldsSchema,
	routineScheduleSchema,
} from "@superset/shared/agent-routines";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { loadAgentAccess } from "./access";
import {
	assertRoutineValid,
	fireRoutine,
	routineChanged,
	routineNotFound,
} from "./routines";

const routineIdSchema = z.object({ routineId: z.string().uuid() });

/** Its creator, or whoever can manage the Dev, may see and change a routine. */
async function loadOwnRoutine(
	userId: string,
	routineId: string,
): Promise<SelectAgentRoutine> {
	const [routine] = await db
		.select()
		.from(agentRoutines)
		.where(eq(agentRoutines.id, routineId))
		.limit(1);
	if (!routine) throw routineNotFound();
	const { canManage } = await loadAgentAccess(userId, routine.agentId).catch(
		() => {
			throw routineNotFound();
		},
	);
	if (!canManage && routine.createdByUserId !== userId) {
		throw routineNotFound();
	}
	return routine;
}

export const agentRoutineRouter = {
	list: protectedProcedure
		.input(z.object({ agentId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { canManage } = await loadAgentAccess(userId, input.agentId);
			const rows = await db
				.select()
				.from(agentRoutines)
				.where(
					and(
						eq(agentRoutines.agentId, input.agentId),
						canManage ? undefined : eq(agentRoutines.createdByUserId, userId),
					),
				)
				.orderBy(desc(agentRoutines.createdAt));
			return rows.map((routine) => ({
				id: routine.id,
				title: routine.title,
				prompt: routine.prompt,
				schedule: routine.schedule,
				triggers: routine.triggers,
				enabled: routine.enabled,
				nextRunAt: routine.nextRunAt,
				lastRunAt: routine.lastRunAt,
				createdByUserId: routine.createdByUserId,
				channelId: routine.channelId,
				threadRootId: routine.threadRootId,
			}));
		}),

	update: protectedProcedure
		.input(
			routineIdSchema.extend({
				title: routineFieldsSchema.shape.title.optional(),
				prompt: routineFieldsSchema.shape.prompt.optional(),
				schedule: routineScheduleSchema.nullable().optional(),
				enabled: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const routine = await loadOwnRoutine(
				ctx.session.user.id,
				input.routineId,
			);
			const { routineId: _, ...patch } = input;
			if (patch.schedule !== undefined) {
				assertRoutineValid({
					schedule: patch.schedule,
					triggers: routine.triggers,
				});
			}
			await db
				.update(agentRoutines)
				.set(patch)
				.where(eq(agentRoutines.id, routine.id));
			await routineChanged(routine.id);
			return { id: routine.id };
		}),

	delete: protectedProcedure
		.input(routineIdSchema)
		.mutation(async ({ ctx, input }) => {
			const routine = await loadOwnRoutine(
				ctx.session.user.id,
				input.routineId,
			);
			await db.delete(agentRoutines).where(eq(agentRoutines.id, routine.id));
			await routineChanged(routine.id);
			return { id: routine.id };
		}),

	runNow: protectedProcedure
		.input(routineIdSchema)
		.mutation(async ({ ctx, input }) => {
			const routine = await loadOwnRoutine(
				ctx.session.user.id,
				input.routineId,
			);
			const outcome = await fireRoutine(routine.id, {
				kind: "manual",
				requestedAt: new Date(),
			});
			return { outcome };
		}),
} satisfies TRPCRouterRecord;
