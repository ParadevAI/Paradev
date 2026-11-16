import { useEffect, useRef } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isInCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import {
	getCloudAgentAlertEvent,
	type ReportedAgentStatus,
} from "../../lib/cloudAgentAlerts";
import { handleCloudAgentAlert } from "../../lib/lifecycleEvents";

/**
 * Cloud workspaces get no host socket in the background (it keeps the sandbox
 * awake), so their alerts come from the agent status each box reports to the
 * API, which reaches this window as a realtime patch of the cloud list.
 */
export function CloudWorkspaceNotifier(): null {
	const { workspaces, organizationId } = useCloudWorkspaces();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const sidebarEntries = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR).entries
			: EMPTY_CLOUD_SIDEBAR.entries,
	);
	const { data: volume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const { data: muted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const soundRef = useRef({ volume, muted });
	soundRef.current = { volume, muted };
	const seenRef = useRef<{
		organizationId: string | null;
		statuses: Map<string, ReportedAgentStatus>;
	}>({ organizationId: null, statuses: new Map() });

	useEffect(() => {
		if (!workspaces) return;
		if (seenRef.current.organizationId !== organizationId) {
			seenRef.current = { organizationId, statuses: new Map() };
		}
		const seen = seenRef.current.statuses;
		const next = new Map<string, ReportedAgentStatus>();
		for (const workspace of workspaces) {
			const current: ReportedAgentStatus = {
				status: workspace.agentStatus ?? null,
				at: workspace.agentStatusAt?.getTime() ?? null,
			};
			next.set(workspace.id, current);
			if (!isInCloudSidebar(workspace, sidebarEntries[workspace.id], userId))
				continue;
			const eventType = getCloudAgentAlertEvent(
				seen.get(workspace.id),
				current,
			);
			if (!eventType) continue;
			handleCloudAgentAlert({
				workspaceId: workspace.id,
				workspaceName: workspace.name,
				eventType,
				...soundRef.current,
			});
		}
		seenRef.current.statuses = next;
	}, [workspaces, organizationId, sidebarEntries, userId]);

	return null;
}
