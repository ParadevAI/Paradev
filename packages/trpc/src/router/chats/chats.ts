import {
	DEV_COLORS,
	groupDevDescription,
	UNREAD_MAX,
} from "@superset/chats-core";
import type {
	AddedGroupDev,
	ApiChatRead,
	ApiGroup,
	ApiMessage,
	ApiMessagePage,
	Bootstrap,
	CreatedChat,
	SendResult,
	SharedFileResult,
} from "@superset/chats-sync";
import { db, dbWs } from "@superset/db/client";
import {
	chatsAgentReads,
	chatsAgentSeedFiles,
	chatsAgents,
	chatsAppCalls,
	chatsBriefs,
	chatsGroupAgents,
	chatsGroupMembers,
	chatsGroups,
	chatsMessages,
	chatsQuestions,
	chatsReads,
	chatsTurns,
	files,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	CHATS_REALTIME_TICKET_SECONDS,
	chatsGroupChannel,
	chatsUserChannel,
	signChatsRealtimeTicket,
} from "@superset/shared/chats-realtime";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	exists,
	getTableColumns,
	inArray,
	isNotNull,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { anchorAttachments } from "../../lib/attachments/attachments";
import { detachAll, reapOrphanFiles } from "../../lib/files";
import { presignedGetUrl } from "../../lib/r2";
import { personProcedure } from "../../trpc";
import { publishChats } from "./publish";
import {
	allListings,
	findListing,
	listingCard,
	listingDetail,
	listingSeeds,
} from "./registry/registry";
import {
	chatTaskDetail,
	commentOnChatTask,
	createChatTask,
	deleteChatTask,
	startChatTask,
	TaskError,
	taskInputSchema,
	taskPatchSchema,
	updateChatTask,
} from "./tasks/chat-tasks";
import {
	chatTasksByIds,
	chatTasksOfGroups,
	taskView,
} from "./tasks/task-store";
import {
	chatsTurnRuntime,
	rearmChatTasks,
	triggerTurns,
	watchTicket,
} from "./turns";
import { enqueueInstalledTurn } from "./turns/engine";
import { answerQuestion, answerSchema, QuestionError } from "./turns/questions";
import {
	agentView,
	messageView,
	replyQuotes,
	sharedFiles,
	toGroupAgent,
	toMessage,
	toQuestion,
	toUser,
} from "./views";

const RECENT_MESSAGES = 200;
const TITLE_MAX = 60;
/** As many Devs from the directory as a group holds. */
const MAX_ADDED_PER_GROUP = 5;
const TEXT_MAX = 10_000;
const FILE_LINK_SECONDS = 60 * 60;

const notFound = (message: string) =>
	new TRPCError({ code: "NOT_FOUND", message });
const forbidden = (message: string) =>
	new TRPCError({ code: "FORBIDDEN", message });
const invalid = (message: string) =>
	new TRPCError({ code: "BAD_REQUEST", message });

/** How long a done task stays in what a chat loads at start. */
const DONE_TASK_DAYS = 30;

/** A task error as the app's API answers it. */
async function tasked<T>(work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (error) {
		if (!(error instanceof TaskError)) throw error;
		throw new TRPCError({
			code:
				error.status === 403
					? "FORBIDDEN"
					: error.status === 404
						? "NOT_FOUND"
						: error.status === 409
							? "CONFLICT"
							: "BAD_REQUEST",
			message: error.message,
		});
	}
}

/** The tasks the messages carry as cards. */
async function cardTasks(messages: ApiMessage[]) {
	const ids = [...new Set(messages.flatMap((message) => message.taskId ?? []))];
	return (await chatTasksByIds(ids)).map(taskView);
}

/** The chats' open tasks, those done lately, and any a loaded message carries. */
async function startTasks(groupIds: string[], messages: ApiMessage[]) {
	const since = Date.now() - DONE_TASK_DAYS * 24 * 60 * 60_000;
	const carried = new Set(messages.flatMap((message) => message.taskId ?? []));
	return (await chatTasksOfGroups(groupIds))
		.filter(
			(found) =>
				found.status !== "done" ||
				carried.has(found.task.id) ||
				(found.task.completedAt?.getTime() ?? Date.now()) > since,
		)
		.map(taskView);
}

const toTurnDetails = (turn: typeof chatsTurns.$inferSelect) => ({
	id: turn.id,
	devId: turn.agentId,
	groupId: turn.groupId,
	parentTurnId: turn.parentTurnId,
	status: turn.status,
	error: turn.error,
	createdAt: turn.createdAt.toISOString(),
	startedAt: turn.startedAt?.toISOString() ?? null,
	settledAt: turn.settledAt?.toISOString() ?? null,
	endedAt: turn.endedAt?.toISOString() ?? null,
	trace: turn.trace,
});

const organizationInput = z.object({ organizationId: z.string().uuid() });
const groupInput = z.object({ groupId: z.string().uuid() });
const messageInput = z.object({ messageId: z.string().uuid() });
const colorInput = z.string().regex(/^#[0-9a-fA-F]{6}$/);

async function assertOrgMember(userId: string, organizationId: string) {
	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership) throw notFound("Organization not found");
}

/** Answers "not found" to a non-member, so a group's existence does not leak. Returns the member's role. */
async function assertMember(userId: string, groupId: string) {
	const [row] = await db
		.select({ role: chatsGroupMembers.role })
		.from(chatsGroupMembers)
		.where(
			and(
				eq(chatsGroupMembers.groupId, groupId),
				eq(chatsGroupMembers.userId, userId),
			),
		);
	if (!row) throw notFound("Group not found");
	return row.role;
}

/**
 * An agent the person may change: their own, or the own agent of a group they are in. Someone who can see it but not
 * change it is refused; anyone else hears "not found".
 */
async function editableAgent(userId: string, agentId: string) {
	const [agent] = await db
		.select()
		.from(chatsAgents)
		.where(eq(chatsAgents.id, agentId));
	if (!agent) throw notFound("Dev not found");
	if (agent.kind === "group" && agent.groupId) {
		await assertMember(userId, agent.groupId);
		return agent;
	}
	if (agent.ownerUserId === userId) return agent;
	const [shared] = await db
		.select({ groupId: chatsGroupAgents.groupId })
		.from(chatsGroupAgents)
		.innerJoin(
			chatsGroupMembers,
			and(
				eq(chatsGroupMembers.groupId, chatsGroupAgents.groupId),
				eq(chatsGroupMembers.userId, userId),
			),
		)
		.where(eq(chatsGroupAgents.agentId, agentId))
		.limit(1);
	if (shared) throw forbidden("Only its owner can change this Dev");
	throw notFound("Dev not found");
}

async function groupIdsOf(userId: string, organizationId: string) {
	const rows = await db
		.select({ groupId: chatsGroupMembers.groupId })
		.from(chatsGroupMembers)
		.innerJoin(chatsGroups, eq(chatsGroups.id, chatsGroupMembers.groupId))
		.where(
			and(
				eq(chatsGroupMembers.userId, userId),
				eq(chatsGroups.organizationId, organizationId),
			),
		)
		.orderBy(asc(chatsGroupMembers.joinedAt));
	return rows.map((row) => row.groupId);
}

async function loadGroups(groupIds: string[]): Promise<ApiGroup[]> {
	if (groupIds.length === 0) return [];
	const [groupRows, memberRows] = await Promise.all([
		db.select().from(chatsGroups).where(inArray(chatsGroups.id, groupIds)),
		db
			.select({
				groupId: chatsGroupMembers.groupId,
				role: chatsGroupMembers.role,
				id: users.id,
				email: users.email,
				name: users.name,
			})
			.from(chatsGroupMembers)
			.innerJoin(users, eq(chatsGroupMembers.userId, users.id))
			.where(inArray(chatsGroupMembers.groupId, groupIds))
			.orderBy(asc(chatsGroupMembers.joinedAt)),
	]);
	return groupRows.map((group) => ({
		id: group.id,
		kind: group.kind,
		title: group.title,
		members: memberRows
			.filter((member) => member.groupId === group.id)
			.map((member) => ({ ...toUser(member), role: member.role })),
	}));
}

async function loadGroup(groupId: string): Promise<ApiGroup> {
	const [group] = await loadGroups([groupId]);
	if (!group) throw notFound("Group not found");
	return group;
}

/** The agents a person sees: their own, and the ones in their groups. */
async function visibleAgents(
	userId: string,
	organizationId: string,
	groupIds: string[],
) {
	const inMyGroups = groupIds.length
		? exists(
				db
					.select({ one: sql`1` })
					.from(chatsGroupAgents)
					.where(
						and(
							eq(chatsGroupAgents.agentId, chatsAgents.id),
							inArray(chatsGroupAgents.groupId, groupIds),
						),
					),
			)
		: undefined;
	const mine = eq(chatsAgents.ownerUserId, userId);
	const rows = await db
		.select({ agent: chatsAgents, ownerName: users.name })
		.from(chatsAgents)
		.leftJoin(users, eq(users.id, chatsAgents.ownerUserId))
		.where(
			and(
				eq(chatsAgents.organizationId, organizationId),
				inMyGroups ? or(mine, inMyGroups) : mine,
			),
		);
	return rows.map(({ agent, ownerName }) =>
		agentView(agent, { owner: agent.ownerUserId === userId, ownerName }),
	);
}

async function withCards(rows: (typeof chatsMessages.$inferSelect)[]) {
	const questionIds = rows.flatMap((row) =>
		row.questionId ? [row.questionId] : [],
	);
	const [questions, quotes, fileById] = await Promise.all([
		questionIds.length
			? db
					.select()
					.from(chatsQuestions)
					.where(inArray(chatsQuestions.id, questionIds))
			: [],
		replyQuotes(rows.map((row) => row.replyToId)),
		sharedFiles(rows),
	]);
	const questionById = new Map(questions.map((q) => [q.id, q]));
	return rows.map((row) =>
		toMessage(
			row,
			row.questionId ? questionById.get(row.questionId) : null,
			quotes.get(row.replyToId ?? ""),
			fileById.get(row.fileId ?? ""),
		),
	);
}

/** Each group's newest `limit` messages, oldest first, and which groups have more before them. */
async function latestMessages(groupIds: string[], limit: number) {
	if (groupIds.length === 0) {
		return { messages: [] as ApiMessage[], withOlder: new Set<string>() };
	}
	const ranked = db
		.select({
			...getTableColumns(chatsMessages),
			rank: sql<number>`row_number() over (partition by ${chatsMessages.groupId} order by ${chatsMessages.createdAt} desc, ${chatsMessages.id} desc)`.as(
				"rank",
			),
		})
		.from(chatsMessages)
		.where(inArray(chatsMessages.groupId, groupIds))
		.as("ranked");
	const rows = await db
		.select()
		.from(ranked)
		.where(lte(ranked.rank, limit + 1))
		.orderBy(asc(ranked.createdAt), asc(ranked.id));
	const withOlder = new Set(
		rows.filter((row) => Number(row.rank) > limit).map((row) => row.groupId),
	);
	const kept = rows
		.filter((row) => Number(row.rank) <= limit)
		.map(({ rank: _rank, ...row }) => row);
	return { messages: await withCards(kept), withOlder };
}

async function listMessages(
	groupId: string,
	options: { beforeId?: string; limit: number },
) {
	const before = options.beforeId
		? sql`(${chatsMessages.createdAt}, ${chatsMessages.id}) < (select c.created_at, c.id from ${chatsMessages} c where c.id = ${options.beforeId} and c.group_id = ${groupId})`
		: undefined;
	const rows = await db
		.select()
		.from(chatsMessages)
		.where(and(eq(chatsMessages.groupId, groupId), before))
		.orderBy(desc(chatsMessages.createdAt), desc(chatsMessages.id))
		.limit(options.limit);
	return withCards(rows.reverse());
}

type ReadRow = Pick<
	typeof chatsReads.$inferSelect,
	"groupId" | "lastReadMessageId" | "lastReadMessageAt" | "lastReadAt"
>;

const toRead = (
	row: ReadRow,
	reader: { userId: string } | { agentId: string },
): ApiChatRead => ({
	groupId: row.groupId,
	userId: "userId" in reader ? reader.userId : null,
	devId: "agentId" in reader ? reader.agentId : null,
	messageId: row.lastReadMessageId,
	messageAt: row.lastReadMessageAt.toISOString(),
	at: row.lastReadAt.toISOString(),
});

async function loadReads(groupIds: string[]): Promise<ApiChatRead[]> {
	if (groupIds.length === 0) return [];
	const [people, agents] = await Promise.all([
		db.select().from(chatsReads).where(inArray(chatsReads.groupId, groupIds)),
		db
			.select()
			.from(chatsAgentReads)
			.where(inArray(chatsAgentReads.groupId, groupIds)),
	]);
	return [
		...people.map((row) => toRead(row, { userId: row.userId })),
		...agents.map((row) => toRead(row, { agentId: row.agentId })),
	];
}

/** Messages by others after the person's read point, per group, capped for the badge. */
async function unreadCounts(userId: string, groupIds: string[]) {
	if (groupIds.length === 0) return {};
	const rows = await db
		.select({
			groupId: chatsMessages.groupId,
			unread: sql<number>`least(count(*), ${UNREAD_MAX})::int`,
		})
		.from(chatsMessages)
		.leftJoin(
			chatsReads,
			and(
				eq(chatsReads.groupId, chatsMessages.groupId),
				eq(chatsReads.userId, userId),
			),
		)
		.where(
			and(
				inArray(chatsMessages.groupId, groupIds),
				sql`(${chatsReads.lastReadMessageAt} is null or (${chatsMessages.createdAt}, ${chatsMessages.id}) > (${chatsReads.lastReadMessageAt}, ${chatsReads.lastReadMessageId}))`,
				sql`${chatsMessages.authorId} is distinct from ${userId}`,
				or(
					isNotNull(chatsMessages.authorId),
					isNotNull(chatsMessages.authorAgentId),
				),
			),
		)
		.groupBy(chatsMessages.groupId);
	return Object.fromEntries(
		groupIds.map((id) => [
			id,
			Number(rows.find((row) => row.groupId === id)?.unread ?? 0),
		]),
	);
}

/** Lets go of the files the named messages shared. Call it before the messages are deleted. */
async function releaseFiles(where: SQL | undefined) {
	const shared = await db
		.select({ id: chatsMessages.id })
		.from(chatsMessages)
		.where(and(where, isNotNull(chatsMessages.fileId)));
	const fileIds = await detachAll({
		parentKind: "chats_message",
		parentIds: shared.map((message) => message.id),
	});
	return () => reapOrphanFiles(fileIds);
}

/** Wakes the Devs that should answer a person's message. A failure here never fails the send. */
async function answer(message: typeof chatsMessages.$inferSelect) {
	const runtime = chatsTurnRuntime();
	if (!runtime) return [];
	try {
		return (await triggerTurns(runtime, message)).ambiguousMentions;
	} catch (error) {
		console.error("[chats] no Dev was woken for", message.id, error);
		return [];
	}
}

async function memberMessage(userId: string, messageId: string) {
	const [message] = await db
		.select()
		.from(chatsMessages)
		.where(eq(chatsMessages.id, messageId));
	if (!message) throw notFound("Message not found");
	const role = await assertMember(userId, message.groupId).catch(() => {
		throw notFound("Message not found");
	});
	return { message, role };
}

async function newDirectGroup(
	tx: Parameters<Parameters<typeof dbWs.transaction>[0]>[0],
	input: {
		organizationId: string;
		userId: string;
		agentId: string;
		title: string;
	},
) {
	const [group] = await tx
		.insert(chatsGroups)
		.values({
			organizationId: input.organizationId,
			kind: "direct",
			title: input.title,
			createdBy: input.userId,
		})
		.returning();
	if (!group) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	await tx
		.insert(chatsGroupMembers)
		.values({ groupId: group.id, userId: input.userId, role: "owner" });
	const [link] = await tx
		.insert(chatsGroupAgents)
		.values({
			groupId: group.id,
			agentId: input.agentId,
			addedBy: input.userId,
		})
		.returning();
	if (!link) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return { groupId: group.id, link };
}

export const chatsRouter = {
	/** Everything the chat store starts from: the person's groups in the organization, their latest messages, agents and reads. */
	bootstrap: personProcedure
		.input(organizationInput)
		.query(async ({ ctx, input }): Promise<Bootstrap> => {
			const user = ctx.session.user;
			await assertOrgMember(user.id, input.organizationId);
			rearmChatTasks();
			const groupIds = await groupIdsOf(user.id, input.organizationId);
			const [agents, recent] = await Promise.all([
				visibleAgents(user.id, input.organizationId, groupIds),
				latestMessages(groupIds, RECENT_MESSAGES),
			]);
			const base = {
				user: toUser(user),
				needsOnboarding: !agents.some(
					(agent) => agent.kind === "personal" && agent.ownerUserId === user.id,
				),
				devs: agents,
				voiceNotes: false,
				taskViews: [],
				tasks: [],
				apps: [],
				triggerBatches: [],
			};
			if (groupIds.length === 0) {
				return {
					...base,
					groups: [],
					groupDevs: [],
					messages: [],
					groupsWithOlderMessages: [],
					reads: [],
					unread: {},
					briefs: [],
				};
			}
			const [groups, links, reads, unread, briefs, tasks] = await Promise.all([
				loadGroups(groupIds),
				db
					.select()
					.from(chatsGroupAgents)
					.where(inArray(chatsGroupAgents.groupId, groupIds)),
				loadReads(groupIds),
				unreadCounts(user.id, groupIds),
				db
					.select()
					.from(chatsBriefs)
					.where(inArray(chatsBriefs.groupId, groupIds)),
				startTasks(groupIds, recent.messages),
			]);
			return {
				...base,
				tasks,
				groups,
				groupDevs: links.map(toGroupAgent),
				messages: recent.messages,
				groupsWithOlderMessages: groupIds.filter((id) =>
					recent.withOlder.has(id),
				),
				reads,
				unread,
				briefs: briefs.map((brief) => ({
					groupId: brief.groupId,
					devId: brief.agentId,
					topics: brief.topics,
					updatedAt: brief.updatedAt.toISOString(),
				})),
			};
		}),

	/** The workspaces the person's Devs created with the person's access, and which Dev made each. */
	devWorkspaces: personProcedure
		.input(organizationInput)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const rows = await db
				.select({
					workspaceId: chatsAppCalls.workspaceId,
					devId: chatsAppCalls.agentId,
				})
				.from(chatsAppCalls)
				.where(
					and(
						eq(chatsAppCalls.organizationId, input.organizationId),
						eq(chatsAppCalls.ownerUserId, userId),
						isNotNull(chatsAppCalls.workspaceId),
						isNotNull(chatsAppCalls.agentId),
					),
				)
				.orderBy(desc(chatsAppCalls.createdAt))
				.limit(500);
			return rows.flatMap((row) =>
				row.workspaceId && row.devId
					? [{ workspaceId: row.workspaceId, devId: row.devId }]
					: [],
			);
		}),

	/** A short-lived ticket for the realtime channels the person may hear: their own and each of their groups'. */
	realtimeTicket: personProcedure
		.input(organizationInput)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const groupIds = await groupIdsOf(userId, input.organizationId);
			const channels = [
				chatsUserChannel(userId),
				...groupIds.map(chatsGroupChannel),
			];
			const token = await signChatsRealtimeTicket(env.REALTIME_NUDGE_SECRET, {
				userId,
				channels,
				exp: Math.floor(Date.now() / 1000) + CHATS_REALTIME_TICKET_SECONDS,
			});
			return { token, channels };
		}),

	sendMessage: personProcedure
		.input(
			groupInput.extend({
				text: z.string().trim().min(1).max(TEXT_MAX),
				clientId: z.string().min(1).max(100).optional(),
				replyToId: z.string().uuid().optional(),
				/** A `/task` message: the task it makes, carried as its card. */
				task: taskInputSchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<SendResult> => {
			const userId = ctx.session.user.id;
			await assertMember(userId, input.groupId);
			if (input.task) {
				return tasked(
					createChatTask(
						chatsTurnRuntime(),
						{ kind: "user", userId },
						input.groupId,
						input.task,
						{ messageText: input.text, clientId: input.clientId },
					),
				);
			}
			if (input.clientId) {
				const [sent] = await db
					.select()
					.from(chatsMessages)
					.where(
						and(
							eq(chatsMessages.groupId, input.groupId),
							eq(chatsMessages.clientId, input.clientId),
						),
					);
				if (sent) return { message: await messageView(sent), task: null };
			}
			if (input.replyToId) {
				const [original] = await db
					.select({ id: chatsMessages.id })
					.from(chatsMessages)
					.where(
						and(
							eq(chatsMessages.id, input.replyToId),
							eq(chatsMessages.groupId, input.groupId),
						),
					);
				if (!original) throw invalid("That message is not in this chat");
			}
			const [message] = await db
				.insert(chatsMessages)
				.values({
					groupId: input.groupId,
					authorId: userId,
					text: input.text,
					clientId: input.clientId,
					replyToId: input.replyToId,
				})
				.returning();
			if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			const payload = { message: await messageView(message), task: null };
			publishChats(chatsGroupChannel(input.groupId), {
				type: "message.created",
				...payload,
			});
			const ambiguousMentions = await answer(message);
			return ambiguousMentions.length > 0
				? { ...payload, ambiguousMentions }
				: payload;
		}),

	/**
	 * Posts a file the person uploaded through `attachment.createUpload`, with
	 * `text` as its caption. A repeat with the same `clientId` answers with the
	 * message already posted.
	 */
	sendFile: personProcedure
		.input(
			groupInput.extend({
				fileId: z.string().uuid(),
				text: z.string().trim().max(TEXT_MAX).default(""),
				clientId: z.string().min(1).max(100).optional(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<SharedFileResult> => {
			const userId = ctx.session.user.id;
			await assertMember(userId, input.groupId);
			const result = async (message: typeof chatsMessages.$inferSelect) => {
				const view = await messageView(message);
				if (!view.file) throw invalid("The file did not finish uploading");
				return { file: view.file, message: view };
			};
			if (input.clientId) {
				const [sent] = await db
					.select()
					.from(chatsMessages)
					.where(
						and(
							eq(chatsMessages.groupId, input.groupId),
							eq(chatsMessages.clientId, input.clientId),
						),
					);
				if (sent) return result(sent);
			}
			const [found] = await db
				.select({ organizationId: chatsGroups.organizationId, file: files })
				.from(chatsGroups)
				.innerJoin(
					files,
					and(
						eq(files.id, input.fileId),
						eq(files.organizationId, chatsGroups.organizationId),
						eq(files.createdByUserId, userId),
						eq(files.status, "pending"),
					),
				)
				.where(eq(chatsGroups.id, input.groupId));
			if (!found) throw notFound("File not found");
			const [message] = await db
				.insert(chatsMessages)
				.values({
					groupId: input.groupId,
					authorId: userId,
					text: input.text,
					fileId: input.fileId,
					clientId: input.clientId,
				})
				.returning();
			if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			await anchorAttachments({
				parentKind: "chats_message",
				parentId: message.id,
				organizationId: found.organizationId,
				fileIds: [input.fileId],
			});
			const [anchored] = await db
				.select({ id: files.id })
				.from(files)
				.where(and(eq(files.id, input.fileId), eq(files.status, "ready")));
			if (!anchored) {
				await db.delete(chatsMessages).where(eq(chatsMessages.id, message.id));
				throw invalid("The file did not finish uploading");
			}
			const payload = await result(message);
			publishChats(chatsGroupChannel(input.groupId), {
				type: "message.created",
				message: payload.message,
				task: null,
			});
			const ambiguousMentions = await answer(message);
			return ambiguousMentions.length > 0
				? { ...payload, ambiguousMentions }
				: payload;
		}),

	/** Where a Dev's box streams its work in a chat the person is in, with a short-lived read-only token. */
	watchToken: personProcedure
		.input(groupInput.extend({ devId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await assertMember(ctx.session.user.id, input.groupId);
			const runtime = chatsTurnRuntime();
			const ticket = runtime
				? await watchTicket(runtime, input.devId, input.groupId)
				: null;
			if (!ticket) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "That Dev isn't working right now",
				});
			}
			return ticket;
		}),

	/** A task in a chat, from the task form. Its card is the message it returns. */
	createTask: personProcedure
		.input(
			groupInput.extend({
				task: taskInputSchema,
				clientId: z.string().min(1).max(100).optional(),
			}),
		)
		.mutation(
			({ ctx, input }): Promise<SendResult> =>
				tasked(
					createChatTask(
						chatsTurnRuntime(),
						{ kind: "user", userId: ctx.session.user.id },
						input.groupId,
						input.task,
						{ clientId: input.clientId },
					),
				),
		),

	updateTask: personProcedure
		.input(z.object({ taskId: z.string().uuid(), patch: taskPatchSchema }))
		.mutation(({ ctx, input }) =>
			tasked(
				updateChatTask(
					chatsTurnRuntime(),
					{ kind: "user", userId: ctx.session.user.id },
					input.taskId,
					input.patch,
				),
			),
		),

	/** Starts a task: its Dev gets to work, or a person's task moves to in progress. */
	startTask: personProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.mutation(({ ctx, input }) =>
			tasked(
				startChatTask(
					chatsTurnRuntime(),
					{ kind: "user", userId: ctx.session.user.id },
					input.taskId,
				),
			),
		),

	commentOnTask: personProcedure
		.input(
			z.object({
				taskId: z.string().uuid(),
				text: z.string().trim().min(1).max(TEXT_MAX),
			}),
		)
		.mutation(async ({ ctx, input }) => ({
			activity: await tasked(
				commentOnChatTask(
					chatsTurnRuntime(),
					{ kind: "user", userId: ctx.session.user.id },
					input.taskId,
					input.text,
				),
			),
		})),

	/** A task's timeline, oldest first. */
	taskActivity: personProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const { activity } = await tasked(
				chatTaskDetail(
					{ kind: "user", userId: ctx.session.user.id },
					input.taskId,
				),
			);
			return { activity };
		}),

	deleteTask: personProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await tasked(
				deleteChatTask(
					{ kind: "user", userId: ctx.session.user.id },
					input.taskId,
				),
			);
		}),

	/** A person's answer to a Dev's question in a chat they are in. The first answer wins. */
	answerQuestion: personProcedure
		.input(
			z.intersection(z.object({ questionId: z.string().uuid() }), answerSchema),
		)
		.mutation(async ({ ctx, input }) => {
			const user = ctx.session.user;
			const [question] = await db
				.select()
				.from(chatsQuestions)
				.where(eq(chatsQuestions.id, input.questionId));
			if (!question) throw notFound("Question not found");
			await assertMember(user.id, question.groupId);
			const [person] = await db
				.select()
				.from(users)
				.where(eq(users.id, user.id));
			try {
				return {
					question: await answerQuestion(
						chatsTurnRuntime(),
						{ id: user.id, name: toUser(person ?? user).displayName },
						question,
						input,
					),
				};
			} catch (error) {
				if (!(error instanceof QuestionError)) throw error;
				throw new TRPCError({
					code:
						error.status === 403
							? "FORBIDDEN"
							: error.status === 409
								? "CONFLICT"
								: "BAD_REQUEST",
					message: error.message,
				});
			}
		}),

	/** A message with the turn that wrote it and the turns that turn asked other Devs for. */
	messageDetails: personProcedure
		.input(messageInput)
		.query(async ({ ctx, input }) => {
			const [message] = await db
				.select()
				.from(chatsMessages)
				.where(eq(chatsMessages.id, input.messageId));
			if (!message) throw notFound("Message not found");
			await assertMember(ctx.session.user.id, message.groupId);
			const [turn] = message.turnId
				? await db
						.select()
						.from(chatsTurns)
						.where(eq(chatsTurns.id, message.turnId))
				: [];
			const asks = turn
				? await db
						.select()
						.from(chatsTurns)
						.where(
							and(
								eq(chatsTurns.parentTurnId, turn.id),
								eq(chatsTurns.groupId, message.groupId),
							),
						)
						.orderBy(asc(chatsTurns.createdAt))
				: [];
			return {
				message: await messageView(message),
				turn: turn ? toTurnDetails(turn) : null,
				asks: asks.map(toTurnDetails),
			};
		}),

	/** A short-lived link to a file shared in a chat the person is in. A mutation, because the link is a credential. */
	fileLink: personProcedure
		.input(z.object({ fileId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const [shared] = await db
				.select({ id: chatsMessages.id })
				.from(chatsMessages)
				.innerJoin(
					chatsGroupMembers,
					and(
						eq(chatsGroupMembers.groupId, chatsMessages.groupId),
						eq(chatsGroupMembers.userId, ctx.session.user.id),
					),
				)
				.where(eq(chatsMessages.fileId, input.fileId))
				.limit(1);
			if (!shared) throw notFound("File not found");
			return {
				url: await presignedGetUrl(
					fileOriginalKey(input.fileId),
					FILE_LINK_SECONDS,
				),
				expiresAt: new Date(
					Date.now() + FILE_LINK_SECONDS * 1000,
				).toISOString(),
			};
		}),

	/** Up to `limit` messages of the group from before `beforeId`, oldest first. */
	olderMessages: personProcedure
		.input(
			groupInput.extend({
				beforeId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.query(async ({ ctx, input }): Promise<ApiMessagePage> => {
			await assertMember(ctx.session.user.id, input.groupId);
			const messages = await listMessages(input.groupId, input);
			return { messages, apps: [], tasks: await cardTasks(messages) };
		}),

	editMessage: personProcedure
		.input(
			messageInput.extend({ text: z.string().trim().min(1).max(TEXT_MAX) }),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { message } = await memberMessage(userId, input.messageId);
			if (message.authorId !== userId) {
				throw forbidden("Only its author can edit this message");
			}
			if (message.taskId || message.questionId || message.fileId) {
				throw invalid("Only a text message can be edited");
			}
			if (input.text === message.text) {
				return { message: await messageView(message) };
			}
			const [updated] = await db
				.update(chatsMessages)
				.set({ text: input.text, editedAt: new Date() })
				.where(eq(chatsMessages.id, input.messageId))
				.returning();
			if (!updated) throw notFound("Message not found");
			const view = await messageView(updated);
			publishChats(chatsGroupChannel(updated.groupId), {
				type: "message.updated",
				message: view,
			});
			return { message: view };
		}),

	deleteMessage: personProcedure
		.input(messageInput)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { message, role } = await memberMessage(userId, input.messageId);
			if (message.authorId !== userId && role !== "owner") {
				throw forbidden(
					"Only its author or the chat's owner can delete this message",
				);
			}
			const reap = await releaseFiles(eq(chatsMessages.id, input.messageId));
			await db
				.delete(chatsMessages)
				.where(eq(chatsMessages.id, input.messageId));
			await reap();
			const channel = chatsGroupChannel(message.groupId);
			publishChats(channel, {
				type: "message.deleted",
				groupId: message.groupId,
				messageId: input.messageId,
			});
			if (message.questionId) {
				const [cancelled] = await db
					.update(chatsQuestions)
					.set({ status: "cancelled" })
					.where(
						and(
							eq(chatsQuestions.id, message.questionId),
							eq(chatsQuestions.status, "open"),
						),
					)
					.returning();
				if (cancelled) {
					publishChats(channel, {
						type: "question.closed",
						groupId: message.groupId,
						question: toQuestion(cancelled),
					});
				}
			}
			return { messageId: input.messageId };
		}),

	/** The person has read the group up to this message; null when they already had, since a read only moves forward. */
	markRead: personProcedure
		.input(groupInput.merge(messageInput))
		.mutation(async ({ ctx, input }): Promise<{ read: ApiChatRead | null }> => {
			const userId = ctx.session.user.id;
			await assertMember(userId, input.groupId);
			const [message] = await db
				.select({ id: chatsMessages.id, createdAt: chatsMessages.createdAt })
				.from(chatsMessages)
				.where(
					and(
						eq(chatsMessages.id, input.messageId),
						eq(chatsMessages.groupId, input.groupId),
					),
				);
			if (!message) throw notFound("No such message in this chat");
			const values = {
				groupId: input.groupId,
				lastReadMessageId: message.id,
				lastReadMessageAt: message.createdAt,
				lastReadAt: sql`now()`,
			};
			const [row] = await db
				.insert(chatsReads)
				.values({ userId, ...values })
				.onConflictDoUpdate({
					target: [chatsReads.userId, chatsReads.groupId],
					set: values,
					setWhere: sql`(${chatsReads.lastReadMessageAt}, ${chatsReads.lastReadMessageId}) < (excluded.last_read_message_at, excluded.last_read_message_id)`,
				})
				.returning();
			if (!row) return { read: null };
			const read = toRead(row, { userId });
			publishChats(chatsGroupChannel(input.groupId), {
				type: "chat.read",
				...read,
			});
			return { read };
		}),

	/** Tells the group's others this person is typing, or stopped. Nothing is stored. */
	reportTyping: personProcedure
		.input(groupInput.extend({ typing: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertMember(userId, input.groupId);
			publishChats(
				chatsGroupChannel(input.groupId),
				{
					type: "typing",
					groupId: input.groupId,
					userId,
					typing: input.typing,
				},
				{ ephemeral: true },
			);
			return { ok: true };
		}),

	/** A new group with its own agent, named like the group unless told otherwise. */
	createGroup: personProcedure
		.input(
			organizationInput.extend({
				title: z.string().trim().min(1).max(TITLE_MAX),
				devName: z.string().trim().min(1).max(TITLE_MAX).optional(),
				devColor: colorInput.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const created = await dbWs.transaction(async (tx) => {
				const [group] = await tx
					.insert(chatsGroups)
					.values({
						organizationId: input.organizationId,
						kind: "group",
						title: input.title,
						createdBy: userId,
					})
					.returning();
				if (!group) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				await tx
					.insert(chatsGroupMembers)
					.values({ groupId: group.id, userId, role: "owner" });
				const [agent] = await tx
					.insert(chatsAgents)
					.values({
						organizationId: input.organizationId,
						kind: "group",
						name: input.devName ?? input.title,
						description: groupDevDescription(input.title),
						color:
							input.devColor ??
							DEV_COLORS[Math.floor(Math.random() * DEV_COLORS.length)] ??
							"#F2B23E",
						groupId: group.id,
					})
					.returning();
				if (!agent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				const [link] = await tx
					.insert(chatsGroupAgents)
					.values({ groupId: group.id, agentId: agent.id, addedBy: userId })
					.returning();
				if (!link) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				return { groupId: group.id, agent, link };
			});
			publishChats(chatsUserChannel(userId), { type: "groups.changed" });
			return {
				group: await loadGroup(created.groupId),
				dev: agentView(created.agent, { owner: false }),
				groupDev: toGroupAgent(created.link),
			} satisfies CreatedChat;
		}),

	renameGroup: personProcedure
		.input(
			groupInput.extend({ title: z.string().trim().min(1).max(TITLE_MAX) }),
		)
		.mutation(async ({ ctx, input }) => {
			const role = await assertMember(ctx.session.user.id, input.groupId);
			if (role !== "owner") {
				throw forbidden("Only the group's owner can rename it");
			}
			const [group] = await db
				.select()
				.from(chatsGroups)
				.where(eq(chatsGroups.id, input.groupId));
			if (!group) throw notFound("Group not found");
			if (group.kind !== "group") {
				throw invalid("A 1:1 is named after its Dev");
			}
			await db
				.update(chatsGroups)
				.set({ title: input.title })
				.where(eq(chatsGroups.id, input.groupId));
			const payload = { id: input.groupId, title: input.title };
			const channel = chatsGroupChannel(input.groupId);
			publishChats(channel, { type: "group.updated", group: payload });
			const [agent] = await db
				.update(chatsAgents)
				.set({ description: groupDevDescription(input.title) })
				.where(
					and(
						eq(chatsAgents.groupId, input.groupId),
						eq(chatsAgents.kind, "group"),
						eq(chatsAgents.description, groupDevDescription(group.title)),
					),
				)
				.returning();
			if (agent) {
				publishChats(channel, {
					type: "dev.updated",
					dev: agentView(agent, { owner: false }),
				});
			}
			return payload;
		}),

	deleteGroup: personProcedure
		.input(groupInput)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const role = await assertMember(userId, input.groupId);
			const [group] = await db
				.select()
				.from(chatsGroups)
				.where(eq(chatsGroups.id, input.groupId));
			if (!group) throw notFound("Group not found");
			if (group.kind === "direct") {
				throw invalid("Delete the Dev to delete its chat");
			}
			if (role !== "owner") {
				throw forbidden("Only the group's owner can delete it");
			}
			const members = await db
				.select({ userId: chatsGroupMembers.userId })
				.from(chatsGroupMembers)
				.where(eq(chatsGroupMembers.groupId, input.groupId));
			const reap = await releaseFiles(eq(chatsMessages.groupId, input.groupId));
			await db.delete(chatsGroups).where(eq(chatsGroups.id, input.groupId));
			await reap();
			for (const member of members) {
				publishChats(chatsUserChannel(member.userId), {
					type: "group.deleted",
					groupId: input.groupId,
					title: group.title,
					deletedBy: userId,
				});
			}
			return { groupId: input.groupId };
		}),

	/** Adds a person from the organization to a group. Any member may; the person hears it and their groups change. */
	addMember: personProcedure
		.input(groupInput.extend({ userId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await assertMember(ctx.session.user.id, input.groupId);
			const [group] = await db
				.select()
				.from(chatsGroups)
				.where(eq(chatsGroups.id, input.groupId));
			if (!group) throw notFound("Group not found");
			if (group.kind !== "group") {
				throw invalid("A 1:1 is you and one Dev");
			}
			const membership = await findOrgMembership({
				userId: input.userId,
				organizationId: group.organizationId,
			});
			if (!membership) throw notFound("Person not found");
			const [joined] = await db
				.insert(chatsGroupMembers)
				.values({ groupId: input.groupId, userId: input.userId })
				.onConflictDoNothing()
				.returning();
			const [person] = await db
				.select({ id: users.id, email: users.email, name: users.name })
				.from(users)
				.where(eq(users.id, input.userId));
			if (!person) throw notFound("Person not found");
			const member = { ...toUser(person), role: "member" as const };
			if (joined) {
				publishChats(chatsGroupChannel(input.groupId), {
					type: "member.joined",
					groupId: input.groupId,
					member,
				});
				publishChats(chatsUserChannel(input.userId), {
					type: "groups.changed",
				});
			}
			return { member };
		}),

	/**
	 * Takes a person out of a group: the owner removes anyone, and anyone but
	 * the owner leaves. Their own agents leave the group with them.
	 */
	removeMember: personProcedure
		.input(groupInput.extend({ userId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const actor = ctx.session.user;
			const role = await assertMember(actor.id, input.groupId);
			const leaving = input.userId === actor.id;
			const [group] = await db
				.select({ kind: chatsGroups.kind })
				.from(chatsGroups)
				.where(eq(chatsGroups.id, input.groupId));
			if (group?.kind !== "group") {
				throw invalid("A 1:1 is you and one Dev");
			}
			if (leaving && role === "owner") {
				throw invalid("The owner cannot leave a group. Delete it instead.");
			}
			if (!leaving && role !== "owner") {
				throw forbidden("Only the group's owner can remove people");
			}
			const [person] = await db
				.select({ id: users.id, email: users.email, name: users.name })
				.from(chatsGroupMembers)
				.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
				.where(
					and(
						eq(chatsGroupMembers.groupId, input.groupId),
						eq(chatsGroupMembers.userId, input.userId),
					),
				);
			if (!person) throw notFound("They aren't in this group");
			const theirDevs = await db
				.select({ id: chatsAgents.id })
				.from(chatsGroupAgents)
				.innerJoin(chatsAgents, eq(chatsAgents.id, chatsGroupAgents.agentId))
				.where(
					and(
						eq(chatsGroupAgents.groupId, input.groupId),
						eq(chatsAgents.ownerUserId, input.userId),
					),
				);
			const note = await dbWs.transaction(async (tx) => {
				await tx
					.delete(chatsGroupMembers)
					.where(
						and(
							eq(chatsGroupMembers.groupId, input.groupId),
							eq(chatsGroupMembers.userId, input.userId),
						),
					);
				await tx
					.delete(chatsReads)
					.where(
						and(
							eq(chatsReads.groupId, input.groupId),
							eq(chatsReads.userId, input.userId),
						),
					);
				if (theirDevs.length > 0) {
					await tx.delete(chatsGroupAgents).where(
						and(
							eq(chatsGroupAgents.groupId, input.groupId),
							inArray(
								chatsGroupAgents.agentId,
								theirDevs.map((dev) => dev.id),
							),
						),
					);
				}
				const name = toUser(person).displayName;
				const [row] = await tx
					.insert(chatsMessages)
					.values({
						groupId: input.groupId,
						text: leaving
							? `${name} left the group`
							: `${toUser(actor).displayName} removed ${name}`,
					})
					.returning();
				return row;
			});
			const channel = chatsGroupChannel(input.groupId);
			for (const dev of theirDevs) {
				publishChats(channel, {
					type: "group_dev.removed",
					groupId: input.groupId,
					devId: dev.id,
				});
			}
			if (note) {
				publishChats(channel, {
					type: "message.created",
					message: await messageView(note),
					task: null,
				});
			}
			publishChats(channel, {
				type: "member.left",
				groupId: input.groupId,
				userId: input.userId,
			});
			publishChats(chatsUserChannel(input.userId), { type: "groups.changed" });
			return { groupId: input.groupId, userId: input.userId };
		}),

	/** The one agent each person has in an organization, with its 1:1. */
	createPersonalDev: personProcedure
		.input(
			organizationInput.extend({
				name: z.string().trim().min(1).max(TITLE_MAX),
				color: colorInput,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const created = await dbWs.transaction(async (tx) => {
				const [agent] = await tx
					.insert(chatsAgents)
					.values({
						organizationId: input.organizationId,
						kind: "personal",
						name: input.name,
						color: input.color,
						ownerUserId: userId,
					})
					.onConflictDoNothing()
					.returning();
				if (!agent) return null;
				const direct = await newDirectGroup(tx, {
					organizationId: input.organizationId,
					userId,
					agentId: agent.id,
					title: agent.name,
				});
				return { agent, ...direct };
			});
			if (!created) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "You already have a personal Dev here",
				});
			}
			publishChats(chatsUserChannel(userId), { type: "groups.changed" });
			return {
				dev: agentView(created.agent, { owner: true }),
				group: await loadGroup(created.groupId),
				groupDev: toGroupAgent(created.link),
			} satisfies CreatedChat;
		}),

	/** An agent a person made, with its 1:1. */
	createDev: personProcedure
		.input(
			organizationInput.extend({
				name: z.string().trim().min(1).max(TITLE_MAX),
				color: colorInput,
				description: z.string().trim().min(1).max(2_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const created = await dbWs.transaction(async (tx) => {
				const [agent] = await tx
					.insert(chatsAgents)
					.values({
						organizationId: input.organizationId,
						kind: "custom",
						name: input.name,
						color: input.color,
						description: input.description,
						ownerUserId: userId,
					})
					.returning();
				if (!agent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				const direct = await newDirectGroup(tx, {
					organizationId: input.organizationId,
					userId,
					agentId: agent.id,
					title: agent.name,
				});
				return { agent, ...direct };
			});
			publishChats(chatsUserChannel(userId), { type: "groups.changed" });
			return {
				dev: agentView(created.agent, { owner: true }),
				group: await loadGroup(created.groupId),
				groupDev: toGroupAgent(created.link),
			} satisfies CreatedChat;
		}),

	/** The directory of ready-made Devs. */
	registry: personProcedure.query(() => ({
		listings: allListings().map(listingCard),
	})),

	/** One listing's page. */
	registryListing: personProcedure
		.input(z.object({ slug: z.string().min(1).max(100) }))
		.query(({ input }) => {
			const listing = findListing(input.slug);
			if (!listing) throw notFound("No such Dev in the directory");
			return { listing: listingDetail(listing) };
		}),

	/**
	 * Gets a Dev from the directory: one of the person's own, with its 1:1, or
	 * one added to a group they are in, owned by the group. A person has at
	 * most one of each listing, and a group at most five added Devs, one of
	 * each.
	 */
	installListing: personProcedure
		.input(
			organizationInput.extend({
				slug: z.string().min(1).max(100),
				target: z.union([
					z.object({ kind: z.literal("you") }),
					z.object({ kind: z.literal("group"), groupId: z.string().uuid() }),
				]),
				name: z.string().trim().min(1).max(TITLE_MAX).optional(),
				paradevAccess: z.boolean().optional(),
				/** The plugins, of the ones its listing uses, the new Dev may use as its owner. */
				plugins: z.array(z.string().min(1).max(100)).max(50).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const user = ctx.session.user;
			await assertOrgMember(user.id, input.organizationId);
			const listing = findListing(input.slug);
			if (!listing) throw notFound("No such Dev in the directory");
			if (!listing.for.includes(input.target.kind)) {
				throw invalid(
					input.target.kind === "group"
						? `${listing.name} can't be added to a group`
						: `${listing.name} is for groups`,
				);
			}
			const [person] = await db
				.select()
				.from(users)
				.where(eq(users.id, user.id));
			const byName = toUser(person ?? user).displayName;
			const name = input.name ?? listing.name;
			const fields = {
				organizationId: input.organizationId,
				name,
				color: listing.color,
				description: listing.summary,
				listingSlug: listing.slug,
				listingVersion: listing.version,
			};
			const seeds = Object.entries(listingSeeds(listing));
			const runtime = chatsTurnRuntime();
			const hello = (agentId: string, groupId: string, title: string | null) =>
				runtime
					? enqueueInstalledTurn(runtime, {
							agentId,
							groupId,
							userId: user.id,
							byName,
							devName: name,
							listingName: listing.name,
							example: listing.examples[0],
							groupTitle: title,
						}).catch((error: unknown) => {
							console.error(
								"[chats] a new Dev's first turn didn't start:",
								error,
							);
							return null;
						})
					: null;

			if (input.target.kind === "you") {
				const created = await dbWs.transaction(async (tx) => {
					await tx
						.select({ id: users.id })
						.from(users)
						.where(eq(users.id, user.id))
						.for("update");
					const [twin] = await tx
						.select({ id: chatsAgents.id })
						.from(chatsAgents)
						.where(
							and(
								eq(chatsAgents.organizationId, input.organizationId),
								eq(chatsAgents.ownerUserId, user.id),
								eq(chatsAgents.listingSlug, listing.slug),
							),
						);
					if (twin) return null;
					const [agent] = await tx
						.insert(chatsAgents)
						.values({
							...fields,
							kind: "custom",
							ownerUserId: user.id,
							paradevAccess: input.paradevAccess === true,
							plugins: (input.plugins ?? []).filter((plugin) =>
								[...listing.needs.apps, ...listing.needs.optional].some(
									(need) => need.app === plugin,
								),
							),
						})
						.returning();
					if (!agent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
					if (seeds.length > 0) {
						await tx.insert(chatsAgentSeedFiles).values(
							seeds.map(([path, content]) => ({
								agentId: agent.id,
								path,
								content,
							})),
						);
					}
					const direct = await newDirectGroup(tx, {
						organizationId: input.organizationId,
						userId: user.id,
						agentId: agent.id,
						title: agent.name,
					});
					return { agent, ...direct };
				});
				if (!created) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `You already have ${listing.name}`,
					});
				}
				publishChats(chatsUserChannel(user.id), { type: "groups.changed" });
				return {
					dev: agentView(created.agent, { owner: true }),
					group: await loadGroup(created.groupId),
					groupDev: toGroupAgent(created.link),
					firstTurnId: await hello(created.agent.id, created.groupId, null),
				};
			}

			const groupId = input.target.groupId;
			await assertMember(user.id, groupId);
			const added = await dbWs.transaction(async (tx) => {
				const [group] = await tx
					.select()
					.from(chatsGroups)
					.where(eq(chatsGroups.id, groupId))
					.for("update");
				if (group?.kind !== "group") {
					throw invalid("Devs can only be added to groups");
				}
				const present = await tx
					.select({ slug: chatsAgents.listingSlug })
					.from(chatsAgents)
					.where(
						and(
							eq(chatsAgents.groupId, groupId),
							eq(chatsAgents.kind, "added"),
						),
					);
				if (present.some((agent) => agent.slug === listing.slug)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `${listing.name} is already in this group`,
					});
				}
				if (present.length >= MAX_ADDED_PER_GROUP) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `A group has at most ${MAX_ADDED_PER_GROUP} added Devs`,
					});
				}
				const [agent] = await tx
					.insert(chatsAgents)
					.values({ ...fields, kind: "added", groupId })
					.returning();
				if (!agent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				if (seeds.length > 0) {
					await tx.insert(chatsAgentSeedFiles).values(
						seeds.map(([path, content]) => ({
							agentId: agent.id,
							path,
							content,
						})),
					);
				}
				const [link] = await tx
					.insert(chatsGroupAgents)
					.values({ groupId, agentId: agent.id, addedBy: user.id })
					.returning();
				if (!link) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				return { agent, link, title: group.title };
			});
			const payload = {
				groupDev: toGroupAgent(added.link),
				dev: agentView(added.agent, { owner: false }),
			};
			publishChats(chatsGroupChannel(groupId), {
				type: "group_dev.added",
				...payload,
			});
			return {
				...payload,
				firstTurnId: await hello(added.agent.id, groupId, added.title),
			};
		}),

	updateDev: personProcedure
		.input(
			z.object({
				devId: z.string().uuid(),
				name: z.string().trim().min(1).max(TITLE_MAX).optional(),
				color: colorInput.optional(),
				description: z.string().trim().max(2_000).optional(),
				paradevAccess: z.boolean().optional(),
				plugins: z.array(z.string().min(1).max(100)).max(50).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const user = ctx.session.user;
			const { devId, ...patch } = input;
			const existing = await editableAgent(user.id, devId);
			if (
				(patch.paradevAccess !== undefined || patch.plugins !== undefined) &&
				existing.ownerUserId !== user.id
			) {
				throw invalid("Only a Dev's owner can choose what it may use");
			}
			if (patch.description === "" && existing.kind !== "personal") {
				throw invalid("A description is required");
			}
			const changes = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			const [updated = existing] = Object.keys(changes).length
				? await db
						.update(chatsAgents)
						.set(changes)
						.where(eq(chatsAgents.id, devId))
						.returning()
				: [];
			const links = await db
				.select({ groupId: chatsGroupAgents.groupId })
				.from(chatsGroupAgents)
				.where(eq(chatsGroupAgents.agentId, devId));
			const [owner] = updated.ownerUserId
				? await db.select().from(users).where(eq(users.id, updated.ownerUserId))
				: [];
			const shared = agentView(updated, {
				owner: false,
				ownerName: owner ? toUser(owner).displayName : null,
			});
			for (const link of links) {
				publishChats(chatsGroupChannel(link.groupId), {
					type: "dev.updated",
					dev: shared,
				});
			}
			if (!updated.ownerUserId) return shared;
			const owned = agentView(updated, { owner: true });
			publishChats(chatsUserChannel(updated.ownerUserId), {
				type: "dev.updated",
				dev: owned,
			});
			return updated.ownerUserId === user.id ? owned : shared;
		}),

	/** Deletes an agent a person made, with its 1:1. It leaves every group it was in. */
	deleteDev: personProcedure
		.input(z.object({ devId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const agent = await editableAgent(userId, input.devId);
			if (agent.kind !== "custom") {
				throw invalid("Only Devs you made can be deleted");
			}
			const links = await db
				.select({ groupId: chatsGroupAgents.groupId, kind: chatsGroups.kind })
				.from(chatsGroupAgents)
				.innerJoin(chatsGroups, eq(chatsGroups.id, chatsGroupAgents.groupId))
				.where(eq(chatsGroupAgents.agentId, input.devId));
			const directIds = links
				.filter((link) => link.kind === "direct")
				.map((link) => link.groupId);
			const reap =
				directIds.length > 0
					? await releaseFiles(inArray(chatsMessages.groupId, directIds))
					: null;
			await dbWs.transaction(async (tx) => {
				if (directIds.length > 0) {
					await tx
						.delete(chatsGroups)
						.where(inArray(chatsGroups.id, directIds));
				}
				await tx.delete(chatsAgents).where(eq(chatsAgents.id, input.devId));
			});
			await reap?.();
			const event = { type: "dev.deleted", devId: input.devId } as const;
			for (const link of links) {
				if (link.kind === "group") {
					publishChats(chatsGroupChannel(link.groupId), event);
				}
			}
			publishChats(chatsUserChannel(userId), event);
			publishChats(chatsUserChannel(userId), { type: "groups.changed" });
			return { devId: input.devId };
		}),

	/** Lets one of the person's own agents into a group they are in. */
	addDevToGroup: personProcedure
		.input(groupInput.extend({ devId: z.string().uuid() }))
		.mutation(async ({ ctx, input }): Promise<AddedGroupDev> => {
			const user = ctx.session.user;
			await assertMember(user.id, input.groupId);
			const [[group], [agent]] = await Promise.all([
				db
					.select({ kind: chatsGroups.kind })
					.from(chatsGroups)
					.where(eq(chatsGroups.id, input.groupId)),
				db.select().from(chatsAgents).where(eq(chatsAgents.id, input.devId)),
			]);
			if (group?.kind !== "group") {
				throw invalid("Devs can only be added to groups");
			}
			if (!agent) throw notFound("Dev not found");
			if (agent.ownerUserId !== user.id) {
				throw forbidden("You can only add or remove your own Devs");
			}
			await db
				.insert(chatsGroupAgents)
				.values({
					groupId: input.groupId,
					agentId: input.devId,
					addedBy: user.id,
				})
				.onConflictDoNothing();
			const [link] = await db
				.select()
				.from(chatsGroupAgents)
				.where(
					and(
						eq(chatsGroupAgents.groupId, input.groupId),
						eq(chatsGroupAgents.agentId, input.devId),
					),
				);
			if (!link) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			const payload = {
				groupDev: toGroupAgent(link),
				dev: agentView(agent, {
					owner: false,
					ownerName: toUser(user).displayName,
				}),
			};
			publishChats(chatsGroupChannel(input.groupId), {
				type: "group_dev.added",
				...payload,
			});
			return payload;
		}),

	removeDevFromGroup: personProcedure
		.input(groupInput.extend({ devId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertMember(userId, input.groupId);
			const [agent] = await db
				.select()
				.from(chatsAgents)
				.where(eq(chatsAgents.id, input.devId));
			if (!agent) throw notFound("Dev not found");
			if (agent.kind === "group" && agent.groupId === input.groupId) {
				throw invalid("A group's own Dev always stays in it");
			}
			if (agent.kind === "added" && agent.groupId === input.groupId) {
				const [[link], role] = await Promise.all([
					db
						.select({ addedBy: chatsGroupAgents.addedBy })
						.from(chatsGroupAgents)
						.where(
							and(
								eq(chatsGroupAgents.groupId, input.groupId),
								eq(chatsGroupAgents.agentId, input.devId),
							),
						),
					assertMember(userId, input.groupId),
				]);
				if (link?.addedBy !== userId && role !== "owner") {
					throw forbidden(
						"Only whoever added it or the group's owner can remove it",
					);
				}
				await db.delete(chatsAgents).where(eq(chatsAgents.id, input.devId));
				publishChats(chatsGroupChannel(input.groupId), {
					type: "group_dev.removed",
					groupId: input.groupId,
					devId: input.devId,
				});
				return { groupId: input.groupId, devId: input.devId };
			}
			if (agent.ownerUserId !== userId) {
				throw forbidden("You can only add or remove your own Devs");
			}
			await db
				.delete(chatsGroupAgents)
				.where(
					and(
						eq(chatsGroupAgents.groupId, input.groupId),
						eq(chatsGroupAgents.agentId, input.devId),
					),
				);
			publishChats(chatsGroupChannel(input.groupId), {
				type: "group_dev.removed",
				groupId: input.groupId,
				devId: input.devId,
			});
			return { groupId: input.groupId, devId: input.devId };
		}),
} satisfies TRPCRouterRecord;
