import { useNavigate } from "@tanstack/react-router";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useNow } from "renderer/hooks/useNow";
import { authClient } from "renderer/lib/auth-client";
import {
	ACTIVE_WITHIN_MS,
	CloudWorkspacePresenceStack,
} from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import { DashboardSidebarCloudRow } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarCloudSection/components/DashboardSidebarCloudRow";
import { DashboardSidebarWorkspaceHoverCardContent } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceHoverCardContent";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { LocalWorkspaceRow } from "./components/LocalWorkspaceRow";
import { useOpenWorkspace } from "./hooks/useOpenWorkspace";
import type { SupersetWorkspaceView } from "./types";
import { toSidebarWorkspace } from "./utils/toSidebarWorkspace";

const NOW_TICK_MS = 60_000;

interface SupersetWorkspaceProps {
	workspace: SupersetWorkspaceView;
	/** Show the branch, PR, checks and review under the row, as the row's hover card does. */
	detail?: boolean;
}

/** A workspace in a card, drawn with the sidebar's own row, presence stack and hover card. */
export function SupersetWorkspace({
	workspace,
	detail = false,
}: SupersetWorkspaceProps) {
	const openWorkspace = useOpenWorkspace();
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const { data: session } = authClient.useSession();
	const openPullRequest = useOpenPullRequestInApp();
	const viewerId = session?.user?.id;
	const pr = workspace.pullRequest;
	const { machineId } = useLocalHostService();
	const sidebar = toSidebarWorkspace(workspace, machineId ?? null);
	const diffStats = workspace.changes
		? {
				additions: workspace.changes.additions,
				deletions: workspace.changes.deletions,
			}
		: null;
	const open = () => openWorkspace(workspace);
	const [owner] = workspace.repo?.split("/") ?? [];

	return (
		<div className="flex flex-col gap-3 px-2 py-2">
			<div className="flex items-center">
				<div className="min-w-0 flex-1">
					{workspace.location === "cloud" ? (
						<DashboardSidebarCloudRow
							className="mx-0"
							workspace={{
								name: workspace.name,
								createdBy: workspace.createdBy
									? {
											userId: workspace.createdBy.id,
											name: workspace.createdBy.name,
											image: workspace.createdBy.image,
										}
									: null,
								status: workspace.status ?? "ready",
								agentStatus: workspace.agentStatus,
								agentStatusAt: workspace.agentStatusAt
									? new Date(workspace.agentStatusAt)
									: null,
								createdAt: new Date(workspace.createdAt),
							}}
							isMine={workspace.createdBy?.id === viewerId}
							isRead
							repo={
								workspace.repo
									? {
											name: workspace.repo,
											iconUrl: resolveProjectIconUrl({
												icon: null,
												repoOwner: owner ?? null,
											}),
										}
									: null
							}
							ports={null}
							pullRequest={
								pr
									? { number: pr.number, state: pr.state, isDraft: pr.isDraft }
									: null
							}
							now={now}
							onOpen={open}
							onOpenPullRequest={() => {
								if (pr) openPullRequest(pr.url);
							}}
						/>
					) : (
						<LocalWorkspaceRow
							workspace={sidebar}
							diffStats={diffStats}
							onOpen={open}
						/>
					)}
				</div>
				{workspace.presence.length > 0 && (
					<CloudWorkspacePresenceStack
						people={workspace.presence.map((person) => ({
							userId: person.id,
							name: person.name,
							image: person.image,
							lastSeenAt: new Date(person.lastSeenAt),
						}))}
						viewerId={viewerId}
						now={now}
						activeWithinMs={ACTIVE_WITHIN_MS}
						onOpenPerson={(userId) =>
							void navigate({
								to: "/cloud-workspaces",
								search: { people: [userId] },
							})
						}
					/>
				)}
			</div>
			{detail && (
				<div className="rounded-md border border-border bg-background/40 px-3 py-3">
					<DashboardSidebarWorkspaceHoverCardContent
						workspace={sidebar}
						diffStats={diffStats}
					/>
				</div>
			)}
		</div>
	);
}
