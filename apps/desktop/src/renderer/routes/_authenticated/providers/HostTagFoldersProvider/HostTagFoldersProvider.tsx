import { createContext, type ReactNode, useContext } from "react";
import {
	type UseHostTagFoldersResult,
	useHostTagFoldersSource,
} from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders";

const HostTagFoldersContext = createContext<UseHostTagFoldersResult | null>(
	null,
);

/**
 * Runs the per-host tag-folder fan-out once and shares the result, so the
 * sidebar sections and the workspace route read one observer per host.
 */
export function HostTagFoldersProvider({ children }: { children: ReactNode }) {
	const value = useHostTagFoldersSource();
	return (
		<HostTagFoldersContext.Provider value={value}>
			{children}
		</HostTagFoldersContext.Provider>
	);
}

export function useHostTagFolders(): UseHostTagFoldersResult {
	const value = useContext(HostTagFoldersContext);
	if (!value) {
		throw new Error(
			"useHostTagFolders must be used within HostTagFoldersProvider",
		);
	}
	return value;
}
