import { db } from "@superset/db/client";
import {
	agentRoutines,
	channels,
	githubRepositories,
	type SelectAgentRoutine,
} from "@superset/db/schema";
import {
	routineFieldsSchema,
	routineScheduleSchema,
} from "@superset/shared/agent-routines";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
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
			const channelIds = [
				...new Set(
					rows.flatMap((routine) => [
						routine.channelId,
						...routine.triggers.flatMap(({ config }) =>
							config.kind === "channel_message" ? [config.channelId] : [],
						),
					]),
				),
			];
			const repoIds = [
				...new Set(
					rows.flatMap((routine) =>
						routine.triggers.flatMap(({ config }) =>
							config.kind === "github" && config.repositories.mode === "list"
								? config.repositories.ids
								: [],
						),
					),
				),
			];
			const [rooms, repos] = await Promise.all([
				channelIds.length
					? db
							.select({
								id: channels.id,
								name: channels.name,
								kind: channels.kind,
							})
							.from(channels)
							.where(inArray(channels.id, channelIds))
					: [],
				repoIds.length
					? db
							.select({
								id: githubRepositories.repoId,
								name: githubRepositories.fullName,
							})
							.from(githubRepositories)
							.where(inArray(githubRepositories.repoId, repoIds))
					: [],
			]);
			const roomById = new Map(rooms.map((room) => [room.id, room]));
			const repoName = new Map(repos.map((repo) => [repo.id, repo.name]));
			return rows.map((routine) => ({
				id: routine.id,
				title: routine.title,
				prompt: routine.prompt,
				schedule: routine.schedule,
				enabled: routine.enabled,
				nextRunAt: routine.nextRunAt,
				lastRunAt: routine.lastRunAt,
				createdByUserId: routine.createdByUserId,
				room: {
					kind: roomById.get(routine.channelId)?.kind ?? "channel",
					name: roomById.get(routine.channelId)?.name ?? "",
					inThread: routine.threadRootId !== null,
				},
				watching: routine.triggers.map(({ config }) =>
					config.kind === "channel_message"
						? {
								kind: "channel" as const,
								name: roomById.get(config.channelId)?.name ?? "",
								includeThreadReplies: config.includeThreadReplies,
							}
						: {
								kind: "event" as const,
								provider: config.kind,
								event: "event" in config ? config.event : null,
								repositories:
									config.kind === "github" &&
									config.repositories.mode === "list"
										? config.repositories.ids.map(
												(id) => repoName.get(id) ?? id,
											)
										: [],
							},
				),
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
