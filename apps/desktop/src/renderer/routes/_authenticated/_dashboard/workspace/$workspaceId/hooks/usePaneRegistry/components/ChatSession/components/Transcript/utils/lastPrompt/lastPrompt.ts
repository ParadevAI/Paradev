import {
	parseAttachmentTags,
	readBookkeeping,
	userMessageText,
} from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { rowMessageId, type TranscriptRow } from "../transcriptRows";

export type LastPrompt = { key: string; messageId: string; text: string };

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** A message with no line of its own pins nothing: an older prompt would caption the wrong reply. */
export function lastPrompt(
	rows: readonly TranscriptRow[],
	harness: string | undefined,
): LastPrompt | null {
	for (let index = rows.length - 1; index >= 0; index--) {
		const row = rows[index];
		if (!row || row.kind !== "item" || row.item.kind !== "user_message") {
			continue;
		}
		const raw = userMessageText(row.item as UserMessage);
		if (readBookkeeping(harness, raw)) continue;
		const { text, pastedTexts } = parseAttachmentTags(raw);
		const line = oneLine(text) || oneLine(pastedTexts[0] ?? "");
		if (line.length === 0) return null;
		return { key: row.key, messageId: rowMessageId(row), text: line };
	}
	return null;
}
