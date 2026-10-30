import { useAcpChatStore } from "renderer/stores/acp-chat";

export function useAcpChatEnabled(): boolean {
	return useAcpChatStore((state) => state.enabled);
}
