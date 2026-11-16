import { Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuMonitor, LuMonitorOff } from "react-icons/lu";
import {
	CloudGlyph,
	type CloudGlyphState,
} from "renderer/routes/_authenticated/components/CloudGlyph";
import type { DashboardSidebarWorkspaceHostType } from "../../../../../../types";

interface DashboardSidebarWorkspaceHostGlyphProps {
	hostType: DashboardSidebarWorkspaceHostType;
	hostIsOnline: boolean | null;
	cloudState?: CloudGlyphState;
	pressure?: "busy" | "critical" | null;
}

/** Marks where a workspace runs; this device is the default and gets nothing. */
export function DashboardSidebarWorkspaceHostGlyph({
	hostType,
	hostIsOnline,
	cloudState = "on",
	pressure = null,
}: DashboardSidebarWorkspaceHostGlyphProps) {
	if (hostType === "local-device") return null;
	const isOffline = hostType === "remote-device" && hostIsOnline === false;

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"relative flex size-5 shrink-0 items-center justify-center",
						isOffline ? "text-muted-foreground/40" : "text-muted-foreground/70",
					)}
				>
					{hostType === "cloud" ? (
						<>
							<CloudGlyph className="size-3" state={cloudState} />
							{pressure ? (
								<span
									className={cn(
										"absolute right-0.5 bottom-0.5 size-1.5 rounded-full",
										pressure === "critical" ? "bg-destructive" : "bg-amber-500",
									)}
								/>
							) : null}
						</>
					) : isOffline ? (
						<LuMonitorOff className="size-3" strokeWidth={2} />
					) : (
						<LuMonitor className="size-3" strokeWidth={2} />
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				{hostType === "cloud" ? (
					cloudState === "connecting" ? (
						<Trans>Cloud workspace: connecting</Trans>
					) : pressure === "critical" ? (
						<Trans>Cloud workspace: out of memory</Trans>
					) : pressure === "busy" ? (
						<Trans>Cloud workspace: under heavy load</Trans>
					) : (
						<Trans>Cloud workspace</Trans>
					)
				) : isOffline ? (
					<Trans>Remote workspace: device offline</Trans>
				) : (
					<Trans>Remote workspace</Trans>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
