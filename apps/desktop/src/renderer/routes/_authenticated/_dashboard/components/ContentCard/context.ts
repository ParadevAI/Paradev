import { createContext } from "react";

export const BareContentCardContext = createContext<
	((isBare: boolean) => void) | null
>(null);
