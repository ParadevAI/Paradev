import { Trans, useLingui } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";
import { CloudPortForwardActions } from "renderer/routes/_authenticated/_dashboard/components/CloudPortForwardActions";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { usePortOpener } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions";
import { usePortForward } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { PortForwardBusyActions } from "renderer/routes/_authenticated/_dashboard/components/PortForwardBusyActions";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { PortForwardStatusDot } from "../PortForwardStatusDot";

interface WorkspacePortRowProps {
	port: DashboardSidebarPort;
}

export function WorkspacePortRow({ port }: WorkspacePortRowProps) {
	const { t } = useLingui();
	const forward = usePortForward(port);
	const { openExternal } = usePortOpener();
	const status = forward?.status;
	const localPort = forward?.localPort ?? null;
	const name = port.label ?? port.processName;

	return (
		<div className="rounded-sm px-2 py-1.5 hover:bg-fill-hover">
			<div className="flex items-center gap-2">
				<PortForwardStatusDot status={status} />
				<span className="w-12 shrink-0 font-mono text-xs tabular-nums">
					{port.port}
				</span>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{name}
				</span>
				{localPort !== null && (
					<button
						type="button"
						onClick={() => openExternal(`http://localhost:${localPort}`)}
						aria-label={t({ message: `Open localhost:${localPort}` })}
						className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{`localhost:${localPort}`}
						<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				)}
				<CloudPortForwardActions port={port} forward={forward} />
			</div>
			{localPort !== null && localPort !== port.port && (
				<p className="mt-1 pl-[3.6rem] text-[11px] text-muted-foreground">
					<Trans>
						{port.port} was in use on this computer, so it moved to {localPort}.
					</Trans>
				</p>
			)}
			{status?.state === "busy" && forward && (
				<div className="mt-1 flex flex-wrap items-center gap-2 pl-[3.6rem] text-[11px] text-amber-500">
					<span>
						<Trans>
							localhost:{status.localPort} is in use on this computer.
						</Trans>
					</span>
					<PortForwardBusyActions forward={forward} />
				</div>
			)}
			{status?.state === "error" && (
				<p className="mt-1 truncate pl-[3.6rem] text-[11px] text-red-400">
					{status.message}
				</p>
			)}
		</div>
	);
}
