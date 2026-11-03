import { db } from "@superset/db/client";
import { agentRoutines, channels } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { loadChannelAccess } from "../channel/access";
import { mainProcedure } from "./main-procedure";
import {
	assertChannelTriggersReadable,
	assertRoutineValid,
	devRoutineChangesSchema,
	insertRoutine,
	routineChanged,
	routineView,
	scheduleFromDev,
	triggersFromDev,
} from "./routines";
import { parseReplyTarget, REPLY_TARGET } from "./turns";

const ROUTINES_PER_DEV = 25;

const personCanRead = (userId: string) => (channelId: string) =>
	loadChannelAccess(userId, channelId).then(
		() => true,
		() => false,
	);

const noSuchRoutine = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message: "No routine of yours has that id.",
	});

/** The routine_update tool: a Dev's own routines. It can pause one but not delete it. */
export const devRoutineTools = {
	listRoutines: mainProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select()
			.from(agentRoutines)
			.where(eq(agentRoutines.agentId, ctx.agentTurn.agentId))
			.orderBy(desc(agentRoutines.createdAt));
		return rows.map(routineView);
	}),

	/** Made for the person this turn works for; it answers at `replyTo`. */
	createRoutine: mainProcedure
		.input(
			devRoutineChangesSchema.extend({
				replyTo: z.string().regex(REPLY_TARGET),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { agentId, organizationId, actingUserId } = ctx.agentTurn;
			if (!actingUserId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Make routines while answering a person; this turn has none.",
				});
			}
			if (!input.title || !input.prompt) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "A routine needs a title and a prompt.",
				});
			}
			const target = parseReplyTarget(input.replyTo);
			if (!target) throw new TRPCError({ code: "BAD_REQUEST" });
			const { rows } = await db.execute<{ allowed: number }>(
				sql`select authz.check_permission('agent', ${agentId}, 'can_post', 'channel', ${target.channelId}) as allowed`,
			);
			const [room] = await db
				.select({ organizationId: channels.organizationId })
				.from(channels)
				.where(eq(channels.id, target.channelId))
				.limit(1);
			if (
				rows[0]?.allowed !== 1 ||
				room?.organizationId !== organizationId ||
				!(await personCanRead(actingUserId)(target.channelId))
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "reply_to must be a room you and the person can use.",
				});
			}
			const [existing] = await db
				.select({ n: count() })
				.from(agentRoutines)
				.where(eq(agentRoutines.agentId, agentId));
			if ((existing?.n ?? 0) >= ROUTINES_PER_DEV) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `You already have ${ROUTINES_PER_DEV} routines. Update or pause one instead.`,
				});
			}
			const schedule = scheduleFromDev(input.schedule ?? null);
			const triggers = await triggersFromDev(organizationId, input);
			assertRoutineValid({ schedule, triggers });
			await assertChannelTriggersReadable(
				agentId,
				triggers,
				personCanRead(actingUserId),
			);
			const routine = await insertRoutine({
				organizationId,
				agentId,
				createdByUserId: actingUserId,
				channelId: target.channelId,
				threadRootId: target.threadRootId,
				fields: {
					title: input.title,
					prompt: input.prompt,
					schedule,
					triggers,
				},
			});
			return routineView(routine);
		}),

	updateRoutine: mainProcedure
		.input(devRoutineChangesSchema.extend({ routineId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { agentId, organizationId } = ctx.agentTurn;
			const [routine] = await db
				.select()
				.from(agentRoutines)
				.where(
					and(
						eq(agentRoutines.id, input.routineId),
						eq(agentRoutines.agentId, agentId),
					),
				)
				.limit(1);
			if (!routine) throw noSuchRoutine();
			const schedule =
				input.schedule === undefined
					? routine.schedule
					: scheduleFromDev(input.schedule);
			const watching =
				input.watchChannels !== undefined || input.watchEvents !== undefined;
			const triggers = watching
				? await triggersFromDev(organizationId, input)
				: routine.triggers;
			if (watching) {
				await assertChannelTriggersReadable(
					agentId,
					triggers,
					personCanRead(routine.createdByUserId),
				);
			}
			if (input.schedule !== undefined || watching) {
				assertRoutineValid({ schedule, triggers });
			}
			const [updated] = await db
				.update(agentRoutines)
				.set({
					...(input.title !== undefined ? { title: input.title } : {}),
					...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
					...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
					schedule,
					triggers,
				})
				.where(eq(agentRoutines.id, routine.id))
				.returning();
			if (!updated) throw noSuchRoutine();
			return routineView((await routineChanged(updated.id)) ?? updated);
		}),
};
