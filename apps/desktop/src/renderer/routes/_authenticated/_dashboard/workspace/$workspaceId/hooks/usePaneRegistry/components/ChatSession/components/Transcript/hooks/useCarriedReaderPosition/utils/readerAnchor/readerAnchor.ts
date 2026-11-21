import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import type { ReaderPosition } from "../../../../../../utils/carriedReaderPosition";
import type { TranscriptRow } from "../../../../utils/transcriptRows";

type UserMessageRow = Extract<TranscriptRow, { kind: "item" }>;

function isUserMessage(row: TranscriptRow | undefined): row is UserMessageRow {
	return row?.kind === "item" && row.item.kind === "user_message";
}

function messageText(row: UserMessageRow): string {
	return userMessageText(row.item as UserMessage);
}

export function readerPositionAt(
	rows: readonly TranscriptRow[],
	visibleIndex: number,
	offsetPx: number,
): ReaderPosition | null {
	let messageIndex = visibleIndex;
	while (messageIndex >= 0 && !isUserMessage(rows[messageIndex])) {
		messageIndex -= 1;
	}
	const message = rows[messageIndex];
	if (!isUserMessage(message)) return null;
	let userMessagesFromEnd = 0;
	for (let index = messageIndex + 1; index < rows.length; index++) {
		if (isUserMessage(rows[index])) userMessagesFromEnd += 1;
	}
	return {
		userMessagesFromEnd,
		messageText: messageText(message),
		rowsAfterMessage: visibleIndex - messageIndex,
		offsetPx,
	};
}

export function restoreTarget(
	rows: readonly TranscriptRow[],
	position: ReaderPosition,
): { row: TranscriptRow; offsetPx: number } | null {
	const messageIndexes = rows.flatMap((row, index) =>
		isUserMessage(row) ? [index] : [],
	);
	const expected = messageIndexes.length - 1 - position.userMessagesFromEnd;
	let messageIndex = messageIndexes[expected];
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const [order, index] of messageIndexes.entries()) {
		const row = rows[index];
		if (!isUserMessage(row) || messageText(row) !== position.messageText) {
			continue;
		}
		const distance = Math.abs(order - expected);
		if (distance < nearestDistance) {
			messageIndex = index;
			nearestDistance = distance;
		}
	}
	if (messageIndex === undefined) return null;
	const visible = rows[messageIndex + position.rowsAfterMessage];
	if (visible) return { row: visible, offsetPx: position.offsetPx };
	const message = rows[messageIndex];
	return message ? { row: message, offsetPx: 0 } : null;
}
