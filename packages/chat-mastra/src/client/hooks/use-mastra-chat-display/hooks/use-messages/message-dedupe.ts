import type { inferRouterOutputs } from "@trpc/server";
import type { ChatMastraServiceRouter } from "../../../../../server/trpc";

export type MastraMessage = NonNullable<
	inferRouterOutputs<ChatMastraServiceRouter>["session"]["listMessages"]
>[number];

export interface DedupeSummary {
	initialMessageCount: number;
	finalMessageCount: number;
	droppedMessageIds: string[];
	droppedToolPartCount: number;
	droppedToolPartsByMessage: Record<string, number>;
}

export function dedupeMessageToolParts(message: MastraMessage): {
	message: MastraMessage;
	droppedCount: number;
} {
	const toolCallIndexes = new Map<string, number>();
	const toolResultIndexes = new Map<string, number>();
	const dedupedContent: MastraMessage["content"] = [];
	let droppedCount = 0;

	for (const part of message.content) {
		if (part.type === "tool_call") {
			const existingIndex = toolCallIndexes.get(part.id);
			if (existingIndex === undefined) {
				toolCallIndexes.set(part.id, dedupedContent.length);
				dedupedContent.push(part);
			} else {
				// Keep latest payload for repeated tool call IDs.
				dedupedContent[existingIndex] = part;
				droppedCount += 1;
			}
			continue;
		}

		if (part.type === "tool_result") {
			const existingIndex = toolResultIndexes.get(part.id);
			if (existingIndex === undefined) {
				toolResultIndexes.set(part.id, dedupedContent.length);
				dedupedContent.push(part);
			} else {
				// Keep latest tool result for repeated tool call IDs.
				dedupedContent[existingIndex] = part;
				droppedCount += 1;
			}
			continue;
		}

		dedupedContent.push(part);
	}

	if (droppedCount === 0) {
		return { message, droppedCount: 0 };
	}

	return {
		message: {
			...message,
			content: dedupedContent,
		},
		droppedCount,
	};
}

export function dedupeMessages(candidates: MastraMessage[]): {
	messages: MastraMessage[];
	summary: DedupeSummary;
} {
	const messagesById = new Map<string, MastraMessage>();
	const droppedMessageIds: string[] = [];
	const droppedToolPartsByMessage: Record<string, number> = {};
	let droppedToolPartCount = 0;

	for (const candidate of candidates) {
		const { message: dedupedToolMessage, droppedCount } =
			dedupeMessageToolParts(candidate);
		const messageId = dedupedToolMessage.id;

		if (messagesById.has(messageId)) {
			droppedMessageIds.push(messageId);
		}
		messagesById.set(messageId, dedupedToolMessage);

		if (droppedCount > 0) {
			droppedToolPartCount += droppedCount;
			droppedToolPartsByMessage[messageId] =
				(droppedToolPartsByMessage[messageId] ?? 0) + droppedCount;
		}
	}

	return {
		messages: [...messagesById.values()],
		summary: {
			initialMessageCount: candidates.length,
			finalMessageCount: messagesById.size,
			droppedMessageIds,
			droppedToolPartCount,
			droppedToolPartsByMessage,
		},
	};
}
