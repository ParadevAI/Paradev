import { unreadChatCount } from "@superset/chats-core";
import { useMemo } from "react";
import { useChatsBridge } from "../../stores/chatsBridge";

/** How many chats have something the person has not read, or a question for them. Zero until chats load. */
export function useUnreadChatCount(): number {
	const state = useChatsBridge((bridge) => bridge.store?.state);
	return useMemo(() => (state ? unreadChatCount(state) : 0), [state]);
}
