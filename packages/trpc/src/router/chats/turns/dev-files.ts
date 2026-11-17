import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsMessages,
	chatsTurns,
	files,
	users,
} from "@superset/db/schema";
import { chatsGroupChannel } from "@superset/shared/chats-realtime";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, desc, eq } from "drizzle-orm";
import { anchorAttachments } from "../../../lib/attachments/attachments";
import { getObject, putObject } from "../../../lib/r2";
import { TRANSFER_ONLY } from "../../attachment/resolvable";
import { publishChats } from "../publish";
import { messageView, toUser } from "../views";

/** As large a file as a Dev shares in a chat. */
export const DEV_FILE_MAX_BYTES = 25 * 1024 * 1024;

type FileRow = typeof files.$inferSelect;

/** How a message's file reads to a Dev: what it is, and the id that fetches it. */
export const fileNote = (
	file: Pick<FileRow, "id" | "name" | "contentType" | "sizeBytes">,
) =>
	`[file: ${file.name} (${file.contentType}, ${file.sizeBytes} bytes), id ${file.id}; save it with \`dev file get ${file.id}\`]`;

/** A message's text as a Dev reads it, with the file it shares. */
export const textWithFile = (text: string, file: FileRow | undefined) =>
	file ? [text, fileNote(file)].filter(Boolean).join("\n") : text;

/**
 * A file a Dev shares in its turn's chat, as a message of its own. Null when
 * the turn may not post: it ended, a newer message replaced it, or it
 * answers another Dev.
 */
export async function shareDevFile(
	claims: { turnId: string; agentId: string },
	input: { name: string; contentType: string; bytes: Uint8Array; text: string },
): Promise<{ fileId: string } | null> {
	const [row] = await db
		.select({ turn: chatsTurns, organizationId: chatsAgents.organizationId })
		.from(chatsTurns)
		.innerJoin(chatsAgents, eq(chatsAgents.id, chatsTurns.agentId))
		.where(eq(chatsTurns.id, claims.turnId));
	if (
		!row ||
		row.turn.agentId !== claims.agentId ||
		row.turn.status !== "running" ||
		row.turn.superseded ||
		row.turn.parentTurnId
	) {
		return null;
	}
	const [file] = await db
		.insert(files)
		.values({
			organizationId: row.organizationId,
			name: input.name,
			contentType: input.contentType,
			sizeBytes: input.bytes.byteLength,
			sha256: TRANSFER_ONLY,
		})
		.returning({ id: files.id });
	if (!file) throw new Error("The file was not recorded");
	await putObject({
		key: fileOriginalKey(file.id),
		body: input.bytes,
		contentType: input.contentType,
		bucket: "private",
	});
	const [message] = await db
		.insert(chatsMessages)
		.values({
			groupId: row.turn.groupId,
			authorAgentId: row.turn.agentId,
			turnId: row.turn.id,
			text: input.text,
			fileId: file.id,
		})
		.returning();
	if (!message) throw new Error("The file's message was not stored");
	await anchorAttachments({
		parentKind: "chats_message",
		parentId: message.id,
		organizationId: row.organizationId,
		fileIds: [file.id],
	});
	publishChats(chatsGroupChannel(row.turn.groupId), {
		type: "message.created",
		message: await messageView(message),
		task: null,
	});
	return { fileId: file.id };
}

/** The files shared in a chat, newest first. */
export async function chatFiles(groupId: string) {
	const rows = await db
		.select({
			file: files,
			at: chatsMessages.createdAt,
			author: users,
			agent: chatsAgents.name,
		})
		.from(chatsMessages)
		.innerJoin(files, eq(files.id, chatsMessages.fileId))
		.leftJoin(users, eq(users.id, chatsMessages.authorId))
		.leftJoin(chatsAgents, eq(chatsAgents.id, chatsMessages.authorAgentId))
		.where(eq(chatsMessages.groupId, groupId))
		.orderBy(desc(chatsMessages.createdAt))
		.limit(100);
	return rows.map(({ file, at, author, agent }) => ({
		id: file.id,
		name: file.name,
		contentType: file.contentType,
		sizeBytes: file.sizeBytes,
		from: agent ?? (author ? toUser(author).displayName : "someone"),
		at: at.toISOString(),
	}));
}

/** A file's name and bytes, when it is shared in that chat. */
export async function chatFileContent(groupId: string, fileId: string) {
	const [shared] = await db
		.select({ file: files })
		.from(chatsMessages)
		.innerJoin(files, eq(files.id, chatsMessages.fileId))
		.where(
			and(eq(chatsMessages.groupId, groupId), eq(chatsMessages.fileId, fileId)),
		)
		.limit(1);
	if (!shared) return null;
	const object = await getObject(fileOriginalKey(fileId));
	return object ? { file: shared.file, body: object.body } : null;
}
