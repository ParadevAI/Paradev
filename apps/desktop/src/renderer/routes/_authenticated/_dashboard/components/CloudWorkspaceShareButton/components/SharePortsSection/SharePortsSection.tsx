import { Trans } from "@lingui/react/macro";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { useExplicitForwards } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { portForwardId } from "shared/types";
import { SharePortRow } from "./components/SharePortRow";
import { ShareStaleForwardRow } from "./components/ShareStaleForwardRow";

interface SharePortsSectionProps {
	workspaceId: string;
}

export function SharePortsSection({ workspaceId }: SharePortsSectionProps) {
	const ports = useDashboardSidebarWorkspacePorts(workspaceId)?.ports ?? [];
	const detected = new Set(
		ports.map((port) =>
			portForwardId({
				hostUrl: port.hostUrl,
				workspaceId: port.workspaceId,
				remotePort: port.port,
			}),
		),
	);
	const stale = useExplicitForwards(workspaceId).filter(
		(forward) => !detected.has(forward.id),
	);

	return (
		<div className="border-t px-3 py-3">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-xs font-medium">
					<Trans>Ports on this computer</Trans>
				</span>
				<span className="text-[11px] text-muted-foreground">
					<Trans>Only you. Teammates forward their own.</Trans>
				</span>
			</div>
			{ports.length === 0 && stale.length === 0 ? (
				<p className="mt-2 text-xs text-muted-foreground">
					<Trans>
						No ports yet. Start a dev server in a terminal and it shows up here.
					</Trans>
				</p>
			) : (
				<div className="mt-1.5 -mx-2 max-h-60 overflow-y-auto">
					{ports.map((port) => (
						<SharePortRow key={`${port.terminalId}:${port.port}`} port={port} />
					))}
					{stale.map((forward) => (
						<ShareStaleForwardRow key={forward.id} forward={forward} />
					))}
				</div>
			)}
		</div>
	);
}
