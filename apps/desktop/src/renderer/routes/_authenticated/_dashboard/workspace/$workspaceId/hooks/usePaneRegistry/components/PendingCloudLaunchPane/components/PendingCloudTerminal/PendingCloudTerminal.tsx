import { Trans } from "@lingui/react/macro";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { provisioningSince } from "renderer/routes/_authenticated/_dashboard/utils/provisioningSince";
import {
	formatElapsed,
	useElapsedSeconds,
} from "renderer/routes/_authenticated/_dashboard/workspace/hooks/useElapsedSeconds";
import { cloudLaunchAgentLabel } from "renderer/stores/workspace-creates/pendingCloudLaunch";
import type { PendingCloudLaunchPaneData } from "../../../../../../types";

export function PendingCloudTerminal({
	data,
	workspaceId,
}: {
	data: PendingCloudLaunchPaneData;
	workspaceId: string;
}) {
	const [since] = useState(() => provisioningSince(workspaceId));
	const elapsed = useElapsedSeconds(since);
	const agentLabel = cloudLaunchAgentLabel(data.agentId);
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div
				className="flex w-full max-w-sm flex-col items-start gap-5"
				aria-live="polite"
			>
				<Loader2
					className="size-5 animate-spin text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="flex w-full flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans>Starting {agentLabel}</Trans>
					</h1>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						<Trans>
							Its terminal opens here when the cloud workspace starts it.
						</Trans>
					</p>
					{data.launchPrompt && (
						<p className="line-clamp-3 select-text cursor-text whitespace-pre-wrap border-l-2 border-border pl-3 text-[13px] leading-relaxed text-muted-foreground">
							{data.launchPrompt}
						</p>
					)}
				</div>
				<span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
					{formatElapsed(elapsed)}
				</span>
			</div>
		</div>
	);
}
