import { Trans, useLingui } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";
import { CloudPortForwardActions } from "renderer/routes/_authenticated/_dashboard/components/CloudPortForwardActions";
import { usePortOpener } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { PortForward } from "shared/types";

interface ShareStaleForwardRowProps {
	forward: PortForward;
}

export function ShareStaleForwardRow({ forward }: ShareStaleForwardRowProps) {
	const { t } = useLingui();
	const { openExternal } = usePortOpener();
	const localPort = forward.localPort;
	return (
		<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-fill-hover">
			<span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
			<span className="w-12 shrink-0 font-mono text-xs tabular-nums">
				{forward.target.remotePort}
			</span>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				<Trans>Not detected in the workspace right now</Trans>
			</span>
			{localPort !== null && (
				<button
					type="button"
					onClick={() => openExternal(`http://localhost:${localPort}`)}
					aria-label={t({ message: `Open localhost:${localPort}` })}
					className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{`localhost:${localPort}`}
					<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
				</button>
			)}
			<CloudPortForwardActions
				port={{
					port: forward.target.remotePort,
					hostUrl: forward.target.hostUrl,
					workspaceId: forward.target.workspaceId,
				}}
				forward={forward}
			/>
		</div>
	);
}
