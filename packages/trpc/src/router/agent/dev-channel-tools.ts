import { db } from "@superset/db/client";
import {
	actors,
	agents,
	channelMessages,
	channels,
	taskProjects,
	taskProjectTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type DevPrincipal, onBehalfOf } from "../../principal";
import { devProcedure } from "../../trpc";
import { loadChannelAccessFor } from "../channel/access";
import { issueFilterFor, listIssues } from "../integration/linear/api";
import { withLinear } from "../integration/linear/live";
import { parseReplyTarget, replyTarget } from "./turns";

const BODY_CHARS = 4_000;
const TASKS_LIMIT = 50;

const channelNotReadable = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message:
			"No channel by that name or target that you and the person you're working for can read.",
	});

/** A channel name ("roster", "#roster") or a reply_to target. */
const channelRef = z.string().min(1).max(200);

/**
 * The channel, and thread if the ref names one, as the Dev may read it for
 * the person it works for.
 */
async function readableChannel(principal: DevPrincipal, ref: string) {
	const target = parseReplyTarget(ref);
	const [named] = target
		? [{ id: target.channelId }]
		: await db
				.select({ id: channels.id })
				.from(channels)
				.where(
					and(
						eq(channels.organizationId, principal.organizationId),
						eq(channels.kind, "channel"),
						isNull(channels.archivedAt),
						sql`lower(${channels.name}) = ${ref.replace(/^#/, "").toLowerCase()}`,
					),
				)
				.limit(1);
	if (!named) throw channelNotReadable();
	const { channel } = await loadChannelAccessFor(principal, named.id).catch(
		() => {
			throw channelNotReadable();
		},
	);
	if (channel.archivedAt) throw channelNotReadable();
	return { channel, threadRootId: target?.threadRootId ?? null };
}

const messageColumns = {
	id: channelMessages.id,
	seq: channelMessages.seq,
	body: channelMessages.body,
	createdAt: channelMessages.createdAt,
	replyCount: channelMessages.replyCount,
	userName: users.name,
	devName: agents.name,
};

/** A Linear project's issues, read with the Linear login of the person the Dev works for. */
async function linearProjectIssues(principal: DevPrincipal, projectId: string) {
	try {
		const page = await withLinear(
			onBehalfOf(principal),
			principal.organizationId,
			(client) =>
				listIssues(client, {
					filter: issueFilterFor({ projectId, status: "all" }),
				}),
		);
		return {
			project: "Linear project",
			tasks: page.issues.map((issue) => ({
				identifier: issue.identifier,
				title: issue.title,
				status: issue.state.name,
				assignee: issue.assignee?.displayName ?? null,
				url: issue.url,
			})),
			more: page.nextCursor !== null,
		};
	} catch (error) {
		return {
			project: "Linear project",
			tasks: [],
			error: `Linear could not be read for the person you work for: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export const devChannelTools = {
	readChannel: devProcedure
		.input(
			z.object({
				channel: channelRef,
				/** Older than this message number; from the previous page's `before`. */
				before: z.number().int().positive().optional(),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { channel, threadRootId } = await readableChannel(
				ctx.principal,
				input.channel,
			);
			const rows = await db
				.select(messageColumns)
				.from(channelMessages)
				.leftJoin(actors, eq(actors.id, channelMessages.authorId))
				.leftJoin(users, eq(users.id, actors.userId))
				.leftJoin(agents, eq(agents.id, actors.agentId))
				.where(
					and(
						eq(channelMessages.channelId, channel.id),
						isNull(channelMessages.deletedAt),
						isNull(channelMessages.subtype),
						threadRootId
							? or(
									eq(channelMessages.id, threadRootId),
									eq(channelMessages.threadRootId, threadRootId),
								)
							: isNull(channelMessages.threadRootId),
						input.before ? lt(channelMessages.seq, input.before) : undefined,
					),
				)
				.orderBy(desc(channelMessages.seq))
				.limit(input.limit + 1);
			const page = rows.slice(0, input.limit).reverse();
			return {
				channel: `#${channel.name}`,
				about: channel.kind === "dm" ? null : channel.description,
				messages: page.map((row) => ({
					from: row.devName ?? row.userName ?? "someone",
					time: row.createdAt.toISOString(),
					body: row.body.slice(0, BODY_CHARS),
					...(threadRootId
						? {}
						: {
								replies: row.replyCount,
								thread: replyTarget(channel.id, row.id),
							}),
				})),
				before: rows.length > input.limit ? (page[0]?.seq ?? null) : null,
			};
		}),

	channelTasks: devProcedure
		.input(z.object({ channel: channelRef }))
		.query(async ({ ctx, input }) => {
			const { channel } = await readableChannel(ctx.principal, input.channel);
			if (channel.linearProjectId) {
				return {
					channel: `#${channel.name}`,
					...(await linearProjectIssues(
						ctx.principal,
						channel.linearProjectId,
					)),
				};
			}
			const projectId = channel.taskProjectId;
			if (!projectId) {
				return { channel: `#${channel.name}`, project: null, tasks: [] };
			}
			const [project] = await db
				.select({ name: taskProjects.name })
				.from(taskProjects)
				.where(eq(taskProjects.id, projectId))
				.limit(1);
			const rows = await db
				.select({
					taskId: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					status: taskStatuses.name,
					assignee: users.name,
					pullRequestUrl: tasks.prUrl,
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
				.orderBy(desc(taskProjectTasks.createdAt), asc(tasks.slug))
				.limit(TASKS_LIMIT);
			return {
				channel: `#${channel.name}`,
				project: project?.name ?? null,
				tasks: rows,
			};
		}),
};
