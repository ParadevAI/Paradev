import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { SessionSidecar } from "../../../SessionSidecar";

interface LocalFinishedWorkspaceProps {
	workspaceId: string;
}

/** The agent that stopped last in a workspace on a device, live in the pane: the same session view a card shows beside itself. */
export function LocalFinishedWorkspace({
	workspaceId,
}: LocalFinishedWorkspaceProps) {
	const navigate = useNavigate();
	const bindings = useTerminalAgentBindings(workspaceId);
	const lastAgent = [...bindings.values()].sort(
		(a, b) => b.lastEventAt - a.lastEventAt,
	)[0];
	const openWorkspace = () =>
		void navigateToV2Workspace(workspaceId, navigate, {
			search: lastAgent
				? { terminalId: lastAgent.terminalId, focusRequestId: workspaceId }
				: undefined,
		});

	if (!lastAgent) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
				<Trans>This workspace has no agent session to show.</Trans>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={openWorkspace}
				>
					<Trans>Open workspace</Trans>
				</Button>
			</div>
		);
	}
	return (
		<div className="min-h-0 flex-1">
			<SessionSidecar
				key={lastAgent.terminalId}
				cardId={`finished-${workspaceId}`}
				workspaceId={workspaceId}
				terminalId={lastAgent.terminalId}
				onOpenWorkspace={openWorkspace}
			/>
		</div>
	);
}
