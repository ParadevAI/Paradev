import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import type { ReactNode } from "react";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { useHostReachability } from "../../../../../hooks/useHostReachability";
import { useWorkspace } from "../../../../../providers/WorkspaceProvider";

/** Hosts that answered since the app started, so a pane remounted during a later drop keeps its contents. */
const answeredHosts = new Set<string>();

/**
 * A pane that reads the cloud box itself (a shell, its files, its git) waits
 * here until the box first answers. Once it has, a later drop is the pane's
 * own to show, so a terminal keeps its scrollback.
 */
export function WaitsForWorkspace({
	message,
	children,
}: {
	message: MessageDescriptor;
	children: ReactNode;
}) {
	const { i18n } = useLingui();
	const { workspace, hostUrl } = useWorkspace();
	const { targets } = useSandboxAccess();
	const isCloud = targets.some(
		(target) => target.workspaceId === workspace.hostId,
	);
	const { isReconnecting, hasConnected } = useHostReachability(hostUrl);
	if (hasConnected) answeredHosts.add(hostUrl);
	if (!isCloud || answeredHosts.has(hostUrl) || !isReconnecting) {
		return children;
	}
	return (
		<div className="flex h-full w-full items-center justify-center gap-2 p-4 text-muted-foreground text-sm">
			<WaveSpinner className="text-amber-500" />
			{i18n._(message)}
		</div>
	);
}
