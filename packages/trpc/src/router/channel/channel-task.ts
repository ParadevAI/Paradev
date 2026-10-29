import { db } from "@superset/db/client";
import {
	channelMembers,
	channels,
	channelTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import {
	assertTaskInOrganization,
	taskColumns,
	toAssignee,
	toTaskChip,
} from "../cloud-workspace/record";
import { recordTaskActivity } from "../task/activity";
import { assertCanPost, loadChannelAccess } from "./access";
import { channelMemberIds } from "./members";
import { publishToUsers } from "./publish";
import { channelIdSchema, channelTaskSchema } from "./schema";

/** Tells the channel's members to reload its task list; others load it on open. */
async function announceTasks(channelId: string) {
	publishToUsers(await channelMemberIds(channelId), {
		type: "channel.tasks",
		channelId,
	});
}

async function currentChannelId(taskId: string) {
	const [row] = await db
		.select({ channelId: channelTasks.channelId })
		.from(channelTasks)
		.where(eq(channelTasks.taskId, taskId))
		.limit(1);
	return row?.channelId ?? null;
}

export const channelTaskRouter = {
	/** The channel a task belongs to, when the reader can see that channel. */
	forTask: protectedProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const [row] = await db
				.select({
					id: channels.id,
					name: channels.name,
					visibility: channels.visibility,
					organizationId: channels.organizationId,
					isMember: channelMembers.actorId,
				})
				.from(channelTasks)
				.innerJoin(channels, eq(channels.id, channelTasks.channelId))
				.leftJoin(
					channelMembers,
					and(
						eq(channelMembers.channelId, channels.id),
						eq(channelMembers.actorId, userId),
					),
				)
				.where(eq(channelTasks.taskId, input.taskId))
				.limit(1);
			if (!row) return null;
			const inOrg = await findOrgMembership({
				userId,
				organizationId: row.organizationId,
			});
			if (!inOrg) return null;
			if (row.visibility === "private" && !row.isMember) return null;
			return { id: row.id, name: row.name, visibility: row.visibility };
		}),

	/** The channel's tasks, newest added first. */
	list: protectedProcedure
		.input(channelIdSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccess(ctx.session.user.id, input.channelId);
			const rows = await db
				.select({
					...taskColumns,
					assigneeId: tasks.assigneeId,
					assigneeName: users.name,
					assigneeImage: users.image,
				})
				.from(channelTasks)
				.innerJoin(tasks, eq(tasks.id, channelTasks.taskId))
				.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
				.leftJoin(users, eq(users.id, tasks.assigneeId))
				.where(
					and(
						eq(channelTasks.channelId, input.channelId),
						isNull(tasks.deletedAt),
					),
				)
				.orderBy(desc(channelTasks.createdAt));
			return rows.map((row) => ({
				...toTaskChip(row),
				assignee: toAssignee(row),
			}));
		}),

	/** A task belongs to one channel; adding it here moves it from any other. */
	add: protectedProcedure
		.input(channelTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanPost(access);
			await assertTaskInOrganization(
				input.taskId,
				access.channel.organizationId,
			);
			const previous = await currentChannelId(input.taskId);
			if (previous && previous !== input.channelId) {
				await loadChannelAccess(ctx.session.user.id, previous).catch(() => {
					throw userError({
						code: "FORBIDDEN",
						message: "This task is in a channel you can't see",
						i18nKey: "serverError.channel.taskInHiddenChannel",
					});
				});
			}
			await db
				.insert(channelTasks)
				.values({ channelId: input.channelId, taskId: input.taskId })
				.onConflictDoUpdate({
					target: channelTasks.taskId,
					set: { channelId: input.channelId, createdAt: new Date() },
				});
			if (previous !== input.channelId) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.session.user.id },
					[{ fromChannelId: previous, toChannelId: input.channelId }],
				);
			}
			await announceTasks(input.channelId);
			if (previous && previous !== input.channelId) {
				await announceTasks(previous);
			}
			return { added: true };
		}),

	remove: protectedProcedure
		.input(channelTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanPost(access);
			const [removed] = await db
				.delete(channelTasks)
				.where(
					and(
						eq(channelTasks.channelId, input.channelId),
						eq(channelTasks.taskId, input.taskId),
					),
				)
				.returning({ taskId: channelTasks.taskId });
			if (removed) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.session.user.id },
					[{ fromChannelId: input.channelId, toChannelId: null }],
				);
			}
			await announceTasks(input.channelId);
			return { removed: true };
		}),
} satisfies TRPCRouterRecord;
