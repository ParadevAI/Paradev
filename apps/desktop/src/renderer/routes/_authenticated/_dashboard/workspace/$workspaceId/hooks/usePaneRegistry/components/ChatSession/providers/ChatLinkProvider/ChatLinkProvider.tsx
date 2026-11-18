import { createContext, type ReactNode, useContext } from "react";

const ChatLinkContext = createContext(false);

export function ChatLinkProvider({ children }: { children: ReactNode }) {
	return <ChatLinkContext.Provider value>{children}</ChatLinkContext.Provider>;
}

export function useIsInsideChatLink(): boolean {
	return useContext(ChatLinkContext);
}
