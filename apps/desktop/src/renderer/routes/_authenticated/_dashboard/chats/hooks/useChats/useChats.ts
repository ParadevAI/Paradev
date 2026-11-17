import { useChatsBridge } from "../../stores/chatsBridge";

/** The chat store, or null until it has mounted. */
export function useChats() {
	return useChatsBridge((state) => state.store);
}
