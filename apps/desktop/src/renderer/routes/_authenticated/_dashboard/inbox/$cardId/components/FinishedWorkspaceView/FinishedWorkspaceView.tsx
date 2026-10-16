import { Trans } from "@lingui/react/macro";
import { LuInbox } from "react-icons/lu";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useInboxPanelStore } from "renderer/stores/inbox-panel-state";
import { CloudFinishedWorkspace } from "./components/CloudFinishedWorkspace";
import { LocalFinishedWorkspace } from "./components/LocalFinishedWorkspace";

interface FinishedWorkspaceViewProps {
	workspaceId: string;
}

/** A workspace whose agent finished, in the inbox's detail pane: the agent itself for a workspace on a device, the workspace's card for one in the cloud. */
export function FinishedWorkspaceView({
	workspaceId,
}: FinishedWorkspaceViewProps) {
	const setPanelOpen = useInboxPanelStore((s) => s.setOpen);
	const { workspaces } = useHostWorkspaces();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const cloud = cloudWorkspaces?.find((row) => row.id === workspaceId);
	const name =
		cloud?.name ?? workspaces.find((w) => w.id === workspaceId)?.name;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader
				className="shadow-[inset_0_-1px_0_var(--border)]"
				start={
					<div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
						<button
							type="button"
							onClick={() => setPanelOpen(true)}
							className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-fill-hover hover:text-foreground"
						>
							<LuInbox className="size-3.5 shrink-0" strokeWidth={1.5} />
							<Trans>Inbox</Trans>
						</button>
						<span className="shrink-0">/</span>
						<span className="truncate font-medium text-foreground">
							{name ?? <Trans>Workspace</Trans>}
						</span>
						<span className="shrink-0">
							· <Trans>Agent finished</Trans>
						</span>
					</div>
				}
			/>
			{cloud ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<div className="mx-auto flex max-w-2xl flex-col gap-4 px-8 py-10">
						<CloudFinishedWorkspace workspace={cloud} />
					</div>
				</div>
			) : (
				<LocalFinishedWorkspace workspaceId={workspaceId} />
			)}
		</div>
	);
}
