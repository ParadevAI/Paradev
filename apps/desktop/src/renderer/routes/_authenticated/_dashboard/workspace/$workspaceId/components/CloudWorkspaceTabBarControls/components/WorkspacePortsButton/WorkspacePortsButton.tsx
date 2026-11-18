import { Trans, useLingui } from "@lingui/react/macro";
import { HEADER_ICON_BUTTON_CLASS } from "@superset/ui/lib/header-controls";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuCable } from "react-icons/lu";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import {
	useExplicitForwards,
	usePortForwardLookup,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { PortsCountIcon } from "renderer/routes/_authenticated/_dashboard/components/PortsCountIcon";
import { type PortForward, portForwardId } from "shared/types";
import { WorkspacePortRow } from "./components/WorkspacePortRow";
import { WorkspaceStaleForwardRow } from "./components/WorkspaceStaleForwardRow";

function isBound(forward: PortForward | null): boolean {
	return forward !== null && forward.localPort !== null;
}

interface WorkspacePortsButtonProps {
	workspaceId: string;
}

export function WorkspacePortsButton({
	workspaceId,
}: WorkspacePortsButtonProps) {
	const { t } = useLingui();
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
	const lookupForward = usePortForwardLookup();
	const forwardedCount =
		ports.filter((port) => isBound(lookupForward(port))).length +
		stale.filter(isBound).length;

	if (ports.length === 0 && stale.length === 0) return null;

	return (
		<Popover>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t({
								message: `Ports on this computer: ${forwardedCount} forwarded`,
							})}
							className={cn(
								"no-drag data-[state=open]:bg-fill-hover data-[state=open]:text-foreground",
								HEADER_ICON_BUTTON_CLASS,
							)}
						>
							<PortsCountIcon count={forwardedCount} icon={LuCable} />
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="text-xs">
						<Trans>Ports on this computer</Trans>
					</p>
				</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" sideOffset={6} className="w-80 p-0">
				<div className="flex flex-col gap-0.5 border-b px-3 py-2">
					<span className="text-xs font-medium">
						<Trans>Ports on this computer</Trans>
					</span>
					<span className="text-[11px] text-muted-foreground">
						<Trans>Only you. Teammates forward their own.</Trans>
					</span>
				</div>
				<div className="max-h-80 overflow-y-auto p-1">
					{ports.map((port) => (
						<WorkspacePortRow
							key={`${port.terminalId}:${port.port}`}
							port={port}
						/>
					))}
					{stale.map((forward) => (
						<WorkspaceStaleForwardRow key={forward.id} forward={forward} />
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
