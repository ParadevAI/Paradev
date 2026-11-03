import {
	readBookkeeping,
	type SessionSnapshot,
	type TurnGroup,
	userMessageText,
} from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { parseAttachmentTags } from "../attachmentTags";
import { buildChatHandoffTranscript } from "../chatHandoffTranscript";

export function editableMessageIds(
	groups: TurnGroup[],
	harness: string | undefined,
): Set<string> {
	const ids = new Set<string>();
	for (const group of groups) {
		for (const entry of group.entries) {
			if (entry.kind !== "item" || entry.item.kind !== "user_message") continue;
			const message = entry.item as UserMessage;
			const raw = userMessageText(message);
			if (readBookkeeping(harness, raw)) continue;
			if (!parseAttachmentTags(raw).text) continue;
			ids.add(message.id);
		}
	}
	return ids;
}

/** The timeline as it stood just before `itemId` was sent. */
export function timelineBefore(
	groups: TurnGroup[],
	itemId: string,
): TurnGroup[] {
	const kept: TurnGroup[] = [];
	for (const group of groups) {
		const index = group.entries.findIndex(
			(entry) => entry.kind === "item" && entry.item.id === itemId,
		);
		if (index === -1) {
			kept.push(group);
			continue;
		}
		if (index > 0)
			kept.push({ ...group, entries: group.entries.slice(0, index) });
		return kept;
	}
	return kept;
}

export function rewindTranscript(
	groups: TurnGroup[],
	itemId: string,
	snapshot: SessionSnapshot,
	agentLabel: string,
): string {
	return buildChatHandoffTranscript(
		timelineBefore(groups, itemId),
		snapshot,
		agentLabel,
	);
}
