import type { ChatState } from "@superset/chats-core";
import type { RealtimeEvent } from "../api-types/api-types.ts";

/**
 * What to tell someone whose open chat was just deleted by someone else (the apps then leave it): null for any other
 * event, another chat, or the user's own deletion, which they just confirmed.
 */
export function deletedGroupNotice(
	state: Pick<ChatState, "meId" | "members">,
	event: RealtimeEvent,
	openChatId: string | null,
) {
	if (
		event.type !== "group.deleted" ||
		event.groupId !== openChatId ||
		event.deletedBy === state.meId
	)
		return null;
	const by = state.members[event.deletedBy]?.name;
	return {
		title: "This group was deleted",
		description: `${by ?? "Its owner"} deleted “${event.title}”.`,
	};
}
