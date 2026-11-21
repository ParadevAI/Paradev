import { createContext, useContext } from "react";

const SessionModeContext = createContext<string | undefined>(undefined);

export const SessionModeProvider = SessionModeContext.Provider;

export function useSessionMode(): string | undefined {
	return useContext(SessionModeContext);
}
