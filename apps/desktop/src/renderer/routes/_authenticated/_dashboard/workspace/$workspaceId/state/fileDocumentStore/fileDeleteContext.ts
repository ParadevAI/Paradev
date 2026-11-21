import { createContext } from "react";

export const FileDeleteContext = createContext<
	((absolutePath: string, isDirectory: boolean) => void) | null
>(null);
