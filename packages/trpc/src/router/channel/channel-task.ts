import { db, dbWs } from "@superset/db/client";
import {
	channelMembers,
	channels,
	taskProjects,
	taskProjectTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { pickEntityColor } from "@superset/shared/entity-colors";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
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

async function channelProjectId(channelId: string) {
	const [row] = await db
		.select({ projectId: channels.taskProjectId })
		.from(channels)
		.where(eq(channels.id, channelId))
		.limit(1);
	return row?.projectId ?? null;
}

/** The channel's project, made and named after the channel when it has none. */
async function ensureChannelProject(channel: {
	id: string;
	name: string;
	organizationId: string;
	taskProjectId: string | null;
}) {
	if (channel.taskProjectId) return channel.taskProjectId;
	return dbWs.transaction(async (tx) => {
		const [locked] = await tx
			.select({ projectId: channels.taskProjectId })
			.from(channels)
			.where(eq(channels.id, channel.id))
			.for("update");
		if (locked?.projectId) return locked.projectId;
		const [project] = await tx
			.insert(taskProjects)
			.values({
				organizationId: channel.organizationId,
				name: channel.name.charAt(0).toUpperCase() + channel.name.slice(1),
				color: pickEntityColor(),
			})
			.returning({ id: taskProjects.id });
		if (!project) throw new Error("project insert returned no row");
		await tx
			.update(channels)
			.set({ taskProjectId: project.id })
			.where(eq(channels.id, channel.id));
		return project.id;
	});
}

export const channelTaskRouter = {
	/** A channel showing the task's project, when the reader can see one. */
	forTask: protectedProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const rows = await db
				.select({
					id: channels.id,
					name: channels.name,
					visibility: channels.visibility,
					organizationId: channels.organizationId,
					isMember: channelMembers.actorId,
				})
				.from(taskProjectTasks)
				.innerJoin(
					channels,
					eq(channels.taskProjectId, taskProjectTasks.projectId),
				)
				.leftJoin(
					channelMembers,
					and(
						eq(channelMembers.channelId, channels.id),
						eq(channelMembers.actorId, userId),
					),
				)
				.where(
					and(
						eq(taskProjectTasks.taskId, input.taskId),
						isNull(channels.archivedAt),
					),
				)
				.orderBy(asc(channels.createdAt));
			const row = rows.find(
				(candidate) => candidate.visibility !== "private" || candidate.isMember,
			);
			if (!row) return null;
			const inOrg = await findOrgMembership({
				userId,
				organizationId: row.organizationId,
			});
			if (!inOrg) return null;
			return { id: row.id, name: row.name, visibility: row.visibility };
		}),

	/** The tasks in the channel's project, newest added first. */
	list: protectedProcedure
		.input(channelIdSchema)
		.query(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			const projectId = access.channel.taskProjectId;
			if (!projectId) return [];
			const rows = await db
				.select({
					...taskColumns,
					assigneeId: tasks.assigneeId,
					assigneeName: users.name,
					assigneeImage: users.image,
				})
				.from(taskProjectTasks)
				.innerJoin(tasks, eq(tasks.id, taskProjectTasks.taskId))
				.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
				.leftJoin(users, eq(users.id, tasks.assigneeId))
				.where(
					and(
						eq(taskProjectTasks.projectId, projectId),
						isNull(tasks.deletedAt),
					),
				)
				.orderBy(desc(taskProjectTasks.createdAt));
			return rows.map((row) => ({
				...toTaskChip(row),
				assignee: toAssignee(row),
			}));
		}),

	/** Moves the task into the channel's project, making the project if needed. */
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
			const projectId = await ensureChannelProject(access.channel);
			const previous = await db.query.taskProjectTasks.findFirst({
				where: eq(taskProjectTasks.taskId, input.taskId),
				columns: { projectId: true },
			});
			await db
				.insert(taskProjectTasks)
				.values({ projectId, taskId: input.taskId })
				.onConflictDoUpdate({
					target: taskProjectTasks.taskId,
					set: { projectId, createdAt: new Date() },
				});
			if (previous?.projectId !== projectId) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.session.user.id },
					[
						{
							fromProjectId: previous?.projectId ?? null,
							toProjectId: projectId,
						},
					],
				);
			}
			await announceTasks(input.channelId);
			return { added: true };
		}),

	/** Takes the task out of the channel's project. */
	remove: protectedProcedure
		.input(channelTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanPost(access);
			const projectId = await channelProjectId(input.channelId);
			const [removed] = projectId
				? await db
						.delete(taskProjectTasks)
						.where(
							and(
								eq(taskProjectTasks.projectId, projectId),
								eq(taskProjectTasks.taskId, input.taskId),
							),
						)
						.returning({ taskId: taskProjectTasks.taskId })
				: [];
			if (removed) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.session.user.id },
					[{ fromProjectId: projectId, toProjectId: null }],
				);
			}
			await announceTasks(input.channelId);
			return { removed: true };
		}),
} satisfies TRPCRouterRecord;
