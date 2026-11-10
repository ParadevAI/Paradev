import { WorkspaceClientProvider } from "@superset/workspace-client";
import type { ReactNode } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface LocalHostClientProps {
	children: ReactNode;
}

/** Sends its children's host-service calls to this machine, not to the
 * workspace's host. Until this machine's host service is up, they keep the
 * workspace's. */
export function LocalHostClient({ children }: LocalHostClientProps) {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) return children;
	return (
		<WorkspaceClientProvider
			cacheKey="mobile-pane-local-host"
			key={activeHostUrl}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			{children}
		</WorkspaceClientProvider>
	);
}
