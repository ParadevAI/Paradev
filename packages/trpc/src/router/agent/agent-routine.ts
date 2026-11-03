import { db } from "@superset/db/client";
import {
	agentRoutines,
	agents,
	channels,
	githubRepositories,
	type SelectAgentRoutine,
} from "@superset/db/schema";
import {
	routineFieldsSchema,
	routineScheduleSchema,
} from "@superset/shared/agent-routines";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import { loadChannelAccess } from "../channel/access";
import { loadAgentAccess } from "./access";
import { ensureDirectMessage } from "./direct-message";
import {
	assertRoutineValid,
	fireRoutine,
	routineChanged,
	routineNotFound,
} from "./routines";

const routineIdSchema = z.object({ routineId: z.string().uuid() });

const roomNotAllowed = () =>
	userError({
		code: "BAD_REQUEST",
		message: "The Dev can't post there.",
		i18nKey: "serverError.routine.roomNotAllowed",
	});

const canRead = (userId: string, channelId: string) =>
	loadChannelAccess(userId, channelId).then(
		() => true,
		() => false,
	);

/**
 * The room a routine's runs answer in. A channel must be one the Dev posts
 * in, readable by both the person editing and the person it works for.
 */
async function roomChannel(
	routine: SelectAgentRoutine,
	room: { kind: "dm" } | { kind: "channel"; channelId: string },
	editorId: string,
): Promise<string> {
	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, routine.agentId))
		.limit(1);
	if (!agent) throw routineNotFound();
	if (room.kind === "dm") {
		return (await ensureDirectMessage(agent, routine.createdByUserId))
			.channelId;
	}
	const [channel] = await db
		.select({ organizationId: channels.organizationId, kind: channels.kind })
		.from(channels)
		.where(eq(channels.id, room.channelId))
		.limit(1);
	const { rows } = await db.execute<{ allowed: number }>(
		sql`select authz.check_permission('agent', ${agent.id}, 'can_post', 'channel', ${room.channelId}) as allowed`,
	);
	if (
		channel?.organizationId !== routine.organizationId ||
		channel.kind !== "channel" ||
		rows[0]?.allowed !== 1 ||
		!(await canRead(editorId, room.channelId)) ||
		!(await canRead(routine.createdByUserId, room.channelId))
	) {
		throw roomNotAllowed();
	}
	return room.channelId;
}

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
					channelId: routine.channelId,
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
				/** Where its runs answer: the DM with the person it works for, or a channel. */
				room: z
					.discriminatedUnion("kind", [
						z.object({ kind: z.literal("dm") }),
						z.object({
							kind: z.literal("channel"),
							channelId: z.string().uuid(),
						}),
					])
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const routine = await loadOwnRoutine(
				ctx.session.user.id,
				input.routineId,
			);
			const { routineId: _, room, ...fields } = input;
			const patch = {
				...fields,
				...(room
					? {
							channelId: await roomChannel(routine, room, ctx.session.user.id),
							threadRootId: null,
						}
					: {}),
			};
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
