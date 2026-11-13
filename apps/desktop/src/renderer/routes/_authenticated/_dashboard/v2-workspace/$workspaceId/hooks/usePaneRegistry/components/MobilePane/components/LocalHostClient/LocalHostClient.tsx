import { Trans, useLingui } from "@lingui/react/macro";
import { WorkspaceClientProvider } from "@superset/workspace-client";
import type { ReactNode } from "react";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { LOCAL_HOST_SERVICE_DETAIL } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider/utils/localHostServiceDetail";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { PaneMessage } from "../PaneMessage";
import { useLastKnown } from "./hooks/useLastKnown";
import { waitsForLocalHost } from "./utils/waitsForLocalHost";

const LOCAL_HOST_GRACE_MS = 10_000;

interface LocalHostClientProps {
	children: ReactNode;
}

/** Sends its children's host-service calls to this machine, not to the
 * workspace's host. A restart of this machine's host service keeps the last
 * address, so the children stay mounted through it. */
export function LocalHostClient({ children }: LocalHostClientProps) {
	const { i18n } = useLingui();
	const { activeHostUrl, hostServiceStatus } = useLocalHostService();
	const hostUrl = useLastKnown(activeHostUrl);
	const graceElapsed = useDelayElapsed(hostUrl === null, LOCAL_HOST_GRACE_MS);

	if (hostUrl === null) {
		return (
			<div className="size-full bg-background">
				<PaneMessage>
					{waitsForLocalHost({ hostServiceStatus, graceElapsed }) ? (
						<Trans>Looking for a mobile simulator…</Trans>
					) : (
						<>
							<Trans>Could not reach a mobile simulator.</Trans>
							<div className="mt-2 text-xs opacity-70">
								{i18n._(LOCAL_HOST_SERVICE_DETAIL.unknown)}
							</div>
						</>
					)}
				</PaneMessage>
			</div>
		);
	}

	return (
		<WorkspaceClientProvider
			cacheKey="mobile-pane-local-host"
			key={hostUrl}
			hostUrl={hostUrl}
			headers={() => getHostServiceHeaders(hostUrl)}
			wsToken={() => getHostServiceWsToken(hostUrl)}
		>
			{children}
		</WorkspaceClientProvider>
	);
}
