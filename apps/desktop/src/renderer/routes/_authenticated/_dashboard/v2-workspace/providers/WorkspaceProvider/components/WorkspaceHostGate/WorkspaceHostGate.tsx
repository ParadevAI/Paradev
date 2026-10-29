import type { ReactNode } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { AgentCredentialsChangedBanner } from "./components/AgentCredentialsChangedBanner";
import { CloudUsageRefusedBanner } from "./components/CloudUsageRefusedBanner";
import { CloudUsageStoppingBanner } from "./components/CloudUsageStoppingBanner";

/** Keeps loaded panes accessible while reporting cloud workspace limits. */
export function WorkspaceHostGate({
	workspace,
	children,
}: {
	workspace: HostShapedWorkspace;
	children: ReactNode;
}) {
	const { agentCredentialsChangedWorkspaceId, usageRefusal } =
		useSandboxAccess();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const stoppingAtLimit = Boolean(
		cloudWorkspaces?.find((row) => row.id === workspace.hostId)?.usageStopAt,
	);

	// The wrapper renders unconditionally — dropping it when the host is
	// reachable would move `children` in the tree and remount the whole
	// workspace on every reconnect.
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex min-h-0 min-w-0 flex-1">{children}</div>
			{agentCredentialsChangedWorkspaceId === workspace.hostId ? (
				<AgentCredentialsChangedBanner workspaceId={workspace.hostId} />
			) : null}
			{stoppingAtLimit ? <CloudUsageStoppingBanner /> : null}
			{usageRefusal?.workspaceId === workspace.hostId ? (
				<CloudUsageRefusedBanner
					workspaceId={workspace.hostId}
					error={usageRefusal.error}
				/>
			) : null}
		</div>
	);
}
