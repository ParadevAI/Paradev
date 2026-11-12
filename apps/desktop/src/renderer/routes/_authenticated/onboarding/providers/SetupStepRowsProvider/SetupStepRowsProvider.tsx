import { createContext, type ReactNode, useContext } from "react";
import type { SetupStepRows } from "../../utils/setupStepRows";

const SetupStepRowsContext = createContext<SetupStepRows>({
	git: false,
	gitHub: false,
	claude: false,
	codex: false,
});

export function SetupStepRowsProvider({
	rows,
	children,
}: {
	rows: SetupStepRows;
	children: ReactNode;
}) {
	return (
		<SetupStepRowsContext.Provider value={rows}>
			{children}
		</SetupStepRowsContext.Provider>
	);
}

/** The rows decided when onboarding opened, so the step never jumps. */
export function useSetupStepRows(): SetupStepRows {
	return useContext(SetupStepRowsContext);
}
