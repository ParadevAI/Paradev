import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { CommandItem } from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { Check, Monitor, MonitorOff } from "lucide-react";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import { WorkspaceStateGlyph } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceStateGlyph";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { hasLiveWorkspaceState } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/hasLiveWorkspaceState";
import { workspaceActivityAt } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { MatchedText } from "../../../MatchedText";

interface WorkspaceSwitcherRowProps {
	workspace: AccessibleV2Workspace;
	isCurrent: boolean;
	query: string;
	onSelect: () => void;
}

function Lead({
	workspace,
	isCurrent,
}: Pick<WorkspaceSwitcherRowProps, "workspace" | "isCurrent">) {
	if (isCurrent) {
		return (
			<Check className="size-3.5 text-muted-foreground" strokeWidth={2.2} />
		);
	}
	if (hasLiveWorkspaceState(workspace)) {
		return <WorkspaceStateGlyph workspace={workspace} />;
	}
	if (workspace.pr) {
		return <PRIcon state={workspace.pr.state} className="size-3" />;
	}
	return <span className="size-1.5 rounded-full bg-muted-foreground/50" />;
}

/** The sidebar's signals on one 34px line: lead glyph, name, project · branch, PR, place, age. */
export function WorkspaceSwitcherRow({
	workspace,
	isCurrent,
	query,
	onSelect,
}: WorkspaceSwitcherRowProps) {
	const { t } = useLingui();
	const { formatAge } = useFormat();
	const projectName = workspace.projectName ?? t({ message: "Session" });
	const isUnread =
		workspace.agentStatus === "review" ||
		workspace.agentStatus === "failed" ||
		workspace.agentStatus === "permission";
	const showsBranch =
		workspace.type !== "session" &&
		workspace.branch.toLowerCase() !== workspace.name.toLowerCase();
	const isDeviceOffline =
		workspace.hostType === "remote-device" && !workspace.hostIsOnline;

	return (
		<CommandItem
			value={workspace.id}
			onSelect={onSelect}
			className={cn(
				"gap-2.5 text-[13px]",
				isCurrent ? "text-muted-foreground" : "text-foreground",
			)}
		>
			<span className="flex size-4 shrink-0 items-center justify-center">
				<Lead workspace={workspace} isCurrent={isCurrent} />
			</span>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className={cn("truncate", isUnread && "font-semibold")}>
					<MatchedText text={workspace.name} query={query} />
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] text-muted-foreground">
					<V2WorkspaceProjectIcon
						projectName={projectName}
						iconUrl={workspace.projectIconUrl}
						size="sm"
						className="size-3.5 rounded-[3px] text-[8px]"
					/>
					<span className="truncate">
						{projectName}
						{showsBranch ? (
							<>
								{" · "}
								<MatchedText text={workspace.branch} query={query} />
							</>
						) : null}
					</span>
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-2.5">
				{workspace.pr ? (
					<span
						title={workspace.pr.title}
						className="flex h-[18px] items-center gap-1 rounded-[6px] bg-foreground/[0.06] px-1.5 font-medium text-[11.5px] text-muted-foreground tabular-nums"
					>
						<PRIcon state={workspace.pr.state} className="size-3" />#
						{workspace.pr.prNumber}
						<WorkspaceChecksDot
							status={workspace.pr.checksStatus}
							checks={workspace.pr.checks}
						/>
					</span>
				) : null}
				{workspace.hostType === "cloud" ? (
					<CloudGlyph className="size-3.5 text-muted-foreground/70" />
				) : workspace.hostType === "remote-device" ? (
					isDeviceOffline ? (
						<MonitorOff className="size-3.5 text-muted-foreground/50" />
					) : (
						<Monitor className="size-3.5 text-muted-foreground/70" />
					)
				) : null}
				<span className="text-[11.5px] text-muted-foreground tabular-nums">
					{isCurrent
						? t({ message: "Current" })
						: formatAge(workspaceActivityAt(workspace))}
				</span>
			</span>
		</CommandItem>
	);
}
