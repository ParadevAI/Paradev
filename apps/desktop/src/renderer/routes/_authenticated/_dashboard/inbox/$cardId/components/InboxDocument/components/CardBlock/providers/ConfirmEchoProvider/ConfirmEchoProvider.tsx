import { createContext, type ReactNode, useContext } from "react";

type Record = (actionId: string, sentence: string | undefined) => void;

const ConfirmEchoContext = createContext<Record>(() => {});

interface ConfirmEchoProviderProps {
	onShown: Record;
	children: ReactNode;
}

/** The server refuses a confirmed action whose sentence is not the one the reader was shown, so a dialog reports the sentence it opened with. */
export function ConfirmEchoProvider({
	onShown,
	children,
}: ConfirmEchoProviderProps) {
	return (
		<ConfirmEchoContext.Provider value={onShown}>
			{children}
		</ConfirmEchoContext.Provider>
	);
}

export function useConfirmEcho(): Record {
	return useContext(ConfirmEchoContext);
}
