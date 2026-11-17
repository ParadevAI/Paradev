import { createContext, useContext } from "react";

const MessageAuthorDevContext = createContext<string | null>(null);

/** The Dev that wrote the message being rendered, for what its text renders into. */
export const MessageAuthorDevProvider = MessageAuthorDevContext.Provider;

export const useMessageAuthorDevId = () => useContext(MessageAuthorDevContext);
