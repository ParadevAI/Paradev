import { createContext, type ReactNode, useContext } from "react";
import {
	type UseHostProjectsResult,
	useHostProjectsSource,
} from "renderer/hooks/host-projects/useHostProjects/useHostProjects";

const HostProjectsContext = createContext<UseHostProjectsResult | null>(null);

/** Runs the per-host project fan-out once and shares the merged result;
 *  consumers must not call the source hook themselves. */
export function HostProjectsProvider({ children }: { children: ReactNode }) {
	const value = useHostProjectsSource();
	return (
		<HostProjectsContext.Provider value={value}>
			{children}
		</HostProjectsContext.Provider>
	);
}

export function useHostProjects(): UseHostProjectsResult {
	const value = useContext(HostProjectsContext);
	if (!value) {
		throw new Error("useHostProjects must be used within HostProjectsProvider");
	}
	return value;
}
