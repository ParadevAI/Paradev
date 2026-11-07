import { Trans } from "@lingui/react/macro";
import { CloudPortForwardActions } from "renderer/routes/_authenticated/_dashboard/components/CloudPortForwardActions";
import type { PortForward } from "shared/types";

interface ShareStaleForwardRowProps {
	forward: PortForward;
}

export function ShareStaleForwardRow({ forward }: ShareStaleForwardRowProps) {
	return (
		<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-fill-hover">
			<span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
			<span className="w-12 shrink-0 font-mono text-xs tabular-nums">
				{forward.target.remotePort}
			</span>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				<Trans>Not detected in the workspace right now</Trans>
			</span>
			{forward.localPort !== null && (
				<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
					localhost:{forward.localPort}
				</span>
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
