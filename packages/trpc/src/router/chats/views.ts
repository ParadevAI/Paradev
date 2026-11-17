import {
	describeDev,
	ownedByGroup,
	parseMentionTokens,
	quoteText,
	type ReplyQuote,
	renderMentions,
	type SharedFile,
} from "@superset/chats-core";
import type {
	ApiDev,
	ApiGroupDev,
	ApiMessage,
	ApiQuestion,
	ApiUser,
} from "@superset/chats-sync";
import { db } from "@superset/db/client";
import {
	chatsAgents,
	type chatsGroupAgents,
	chatsMessages,
	chatsQuestions,
	files,
	tasks,
	users,
} from "@superset/db/schema";
import { eq, inArray } from "drizzle-orm";

type UserRow = Pick<typeof users.$inferSelect, "id" | "email" | "name">;
type AgentRow = typeof chatsAgents.$inferSelect;
type MessageRow = typeof chatsMessages.$inferSelect;
type FileRow = typeof files.$inferSelect;
type QuestionRow = typeof chatsQuestions.$inferSelect;

export const toUser = (user: UserRow): ApiUser => ({
	id: user.id,
	email: user.email,
	name: user.name,
	displayName: user.name || (user.email.split("@")[0] ?? user.email),
});

export function agentView(
	agent: AgentRow,
	reader: { owner: boolean; ownerName?: string | null },
): ApiDev {
	return {
		id: agent.id,
		kind: agent.kind,
		name: agent.name,
		color: agent.color,
		look: agent.look,
		ownerUserId: agent.ownerUserId,
		groupId: agent.groupId,
		status: agent.status,
		createdAt: agent.createdAt.toISOString(),
		description: describeDev(agent, agent.description, {
			isOwner: reader.owner,
			ownerName: reader.ownerName ?? null,
		}),
		listing:
			agent.listingSlug && agent.listingVersion
				? { slug: agent.listingSlug, version: agent.listingVersion }
				: null,
		...(reader.owner || ownedByGroup(agent)
			? { descriptionText: agent.description }
			: {}),
		...(reader.owner && agent.ownerUserId
			? { paradevAccess: agent.paradevAccess, plugins: agent.plugins }
			: {}),
	};
}

export const toGroupAgent = (
	link: typeof chatsGroupAgents.$inferSelect,
): ApiGroupDev => ({
	groupId: link.groupId,
	devId: link.agentId,
	addedBy: link.addedBy,
});

export const toQuestion = (question: QuestionRow): ApiQuestion => ({
	id: question.id,
	devId: question.agentId,
	taskId: question.taskId,
	kind: question.kind,
	title: question.title,
	body: question.body,
	options: question.options,
	parts: question.parts,
	allowOther: question.allowOther,
	placeholder: question.placeholder,
	forUserId: question.forUserId,
	status: question.status,
	answer: question.answer,
	answers: question.answers,
	typed: question.typed,
	answeredBy: question.answeredBy,
	answeredAt: question.answeredAt?.toISOString() ?? null,
	expiresAt: question.expiresAt.toISOString(),
});

const toSharedFile = (message: MessageRow, file: FileRow): SharedFile => ({
	id: file.id,
	chatId: message.groupId,
	name: file.name,
	title: "",
	mime: file.contentType,
	size: file.sizeBytes,
	sharedBy: message.authorAgentId
		? { kind: "dev", id: message.authorAgentId }
		: message.authorId
			? { kind: "user", id: message.authorId }
			: null,
	preview: "",
	createdAt: file.createdAt.toISOString(),
});

/** The file each message shares, by the file's id. */
export async function sharedFiles(
	rows: Pick<MessageRow, "fileId">[],
): Promise<Map<string, FileRow>> {
	const ids = rows.flatMap((row) => (row.fileId ? [row.fileId] : []));
	if (ids.length === 0) return new Map();
	const found = await db.select().from(files).where(inArray(files.id, ids));
	return new Map(found.map((file) => [file.id, file]));
}

export const toMessage = (
	message: MessageRow,
	question?: QuestionRow | null,
	quote?: ReplyQuote,
	file?: FileRow,
): ApiMessage => ({
	id: message.id,
	groupId: message.groupId,
	authorId: message.authorId,
	authorDevId: message.authorAgentId,
	text: message.text,
	taskId: message.taskId,
	turnId: message.turnId,
	...(question ? { question: toQuestion(question) } : {}),
	...(message.replyToId ? { replyTo: quote ?? null } : {}),
	...(file ? { file: toSharedFile(message, file) } : {}),
	...(message.editedAt ? { editedAt: message.editedAt.toISOString() } : {}),
	clientId: message.clientId,
	at: message.createdAt.toISOString(),
});

async function mentionNames(texts: string[]): Promise<Map<string, string>> {
	const refs = texts.flatMap(parseMentionTokens);
	const userIds = [
		...new Set(refs.flatMap((ref) => (ref.kind === "user" ? [ref.id] : []))),
	];
	const agentIds = [
		...new Set(refs.flatMap((ref) => (ref.kind === "dev" ? [ref.id] : []))),
	];
	const [people, agents] = await Promise.all([
		userIds.length
			? db
					.select({ id: users.id, email: users.email, name: users.name })
					.from(users)
					.where(inArray(users.id, userIds))
			: [],
		agentIds.length
			? db
					.select({ id: chatsAgents.id, name: chatsAgents.name })
					.from(chatsAgents)
					.where(inArray(chatsAgents.id, agentIds))
			: [],
	]);
	return new Map<string, string>([
		...people.map((user) => [user.id, toUser(user).displayName] as const),
		...agents.map((agent) => [agent.id, agent.name] as const),
	]);
}

/** The quote each replied-to message shows over its reply, by the original's id. */
export async function replyQuotes(
	ids: (string | null)[],
): Promise<Map<string, ReplyQuote>> {
	const wanted = [...new Set(ids.filter((id): id is string => !!id))];
	if (wanted.length === 0) return new Map();
	const rows = await db
		.select({
			message: chatsMessages,
			userId: users.id,
			userEmail: users.email,
			userName: users.name,
			agent: chatsAgents.name,
			task: tasks.title,
			question: chatsQuestions.title,
			file: files.name,
		})
		.from(chatsMessages)
		.leftJoin(users, eq(users.id, chatsMessages.authorId))
		.leftJoin(chatsAgents, eq(chatsAgents.id, chatsMessages.authorAgentId))
		.leftJoin(tasks, eq(tasks.id, chatsMessages.taskId))
		.leftJoin(chatsQuestions, eq(chatsQuestions.id, chatsMessages.questionId))
		.leftJoin(files, eq(files.id, chatsMessages.fileId))
		.where(inArray(chatsMessages.id, wanted));
	const names = await mentionNames(rows.map((row) => row.message.text));
	return new Map(
		rows.map(({ message, ...row }) => [
			message.id,
			{
				id: message.id,
				authorName:
					row.agent ??
					(row.userId && row.userEmail !== null
						? toUser({
								id: row.userId,
								email: row.userEmail,
								name: row.userName ?? "",
							}).displayName
						: ""),
				authorKind: message.authorAgentId
					? "dev"
					: message.authorId
						? "person"
						: "note",
				authorId: message.authorAgentId ?? message.authorId,
				text: quoteText({
					text: renderMentions(
						message.text,
						(ref) => names.get(ref.id) ?? "someone",
					),
					taskTitle: row.task,
					appName: null,
					questionTitle: row.question,
					fileName: row.file,
				}),
			} satisfies ReplyQuote,
		]),
	);
}

export async function messageView(message: MessageRow): Promise<ApiMessage> {
	const quote = message.replyToId
		? (await replyQuotes([message.replyToId])).get(message.replyToId)
		: undefined;
	const file = (await sharedFiles([message])).get(message.fileId ?? "");
	return toMessage(message, null, quote, file);
}
