import { createContext, useContext } from "react";

const ChatKeyContext = createContext("");

export const ChatKeyProvider = ChatKeyContext.Provider;

export function useChatKey(): string {
	return useContext(ChatKeyContext);
}
