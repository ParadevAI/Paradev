import { Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuMonitor, LuMonitorOff } from "react-icons/lu";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import type { DashboardSidebarWorkspaceHostType } from "../../../../../../types";

interface DashboardSidebarWorkspaceHostGlyphProps {
	hostType: DashboardSidebarWorkspaceHostType;
	hostIsOnline: boolean | null;
}

/** Marks where a workspace runs; this device is the default and gets nothing. */
export function DashboardSidebarWorkspaceHostGlyph({
	hostType,
	hostIsOnline,
}: DashboardSidebarWorkspaceHostGlyphProps) {
	if (hostType === "local-device") return null;
	const isOffline = hostType === "remote-device" && hostIsOnline === false;

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"flex size-5 shrink-0 items-center justify-center",
						isOffline ? "text-muted-foreground/40" : "text-muted-foreground/70",
					)}
				>
					{hostType === "cloud" ? (
						<CloudGlyph className="size-3" />
					) : isOffline ? (
						<LuMonitorOff className="size-3" strokeWidth={2} />
					) : (
						<LuMonitor className="size-3" strokeWidth={2} />
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				{hostType === "cloud" ? (
					<Trans>Cloud workspace</Trans>
				) : isOffline ? (
					<Trans>Remote workspace — device offline</Trans>
				) : (
					<Trans>Remote workspace</Trans>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
