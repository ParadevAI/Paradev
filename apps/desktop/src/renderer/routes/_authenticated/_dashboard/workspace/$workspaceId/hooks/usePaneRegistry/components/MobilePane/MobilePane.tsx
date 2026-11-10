import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { workspaceTrpc } from "@superset/workspace-client";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { CloudSimulator } from "./components/CloudSimulator";
import { LocalDevices } from "./components/LocalDevices";
import { LocalHostClient } from "./components/LocalHostClient";
import { PaneMessage } from "./components/PaneMessage";
import { fallsBackToLocalHost } from "./utils/fallsBackToLocalHost";

/** Mobile simulator backed by whichever this host can produce: a hosted
 * simulator on a cloud sandbox, or a local iOS/Android simulator on a real
 * machine. */
interface MobilePaneProps {
	workspaceId: string;
	/** The pane asks this machine, not the workspace's host. */
	onLocalHost?: boolean;
}

export function MobilePane({
	workspaceId,
	onLocalHost = false,
}: MobilePaneProps) {
	const workspaceHost = useWorkspaceHostTarget(workspaceId);
	const statusQuery = workspaceTrpc.mobile.status.useQuery();
	const backend = statusQuery.data?.backend;

	if (!onLocalHost && fallsBackToLocalHost({ workspaceHost, backend })) {
		return (
			<LocalHostClient>
				<MobilePane workspaceId={workspaceId} onLocalHost />
			</LocalHostClient>
		);
	}

	if (backend === "eas") {
		return (
			<div className="size-full bg-background">
				<CloudSimulator workspaceId={workspaceId} />
			</div>
		);
	}

	if (backend === "local-ios" || backend === "local-android") {
		return (
			<div className="size-full bg-background">
				<LocalDevices workspaceId={workspaceId} remembersPick={!onLocalHost} />
			</div>
		);
	}

	return (
		<div className="size-full bg-background">
			<PaneMessage>
				{statusQuery.isError ? (
					<>
						<Trans>Could not reach a mobile simulator.</Trans>
						<div className="mt-2 text-xs opacity-70">
							{errorMessage(statusQuery.error)}
						</div>
					</>
				) : statusQuery.isPending ? (
					<Trans>Looking for a mobile simulator…</Trans>
				) : (
					<Trans>
						No mobile simulator available here. This needs either an EAS
						simulator on a cloud sandbox or a local iOS/Android toolchain.
					</Trans>
				)}
			</PaneMessage>
		</div>
	);
}
