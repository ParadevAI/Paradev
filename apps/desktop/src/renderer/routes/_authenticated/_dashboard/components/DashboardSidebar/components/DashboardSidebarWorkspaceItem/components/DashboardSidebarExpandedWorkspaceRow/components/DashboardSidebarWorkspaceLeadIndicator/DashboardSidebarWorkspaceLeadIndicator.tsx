import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
} from "../../../../../../types";
import {
	PR_COLOR_BY_STATE,
	PR_ICON_BY_STATE,
} from "../../../DashboardSidebarWorkspaceIcon";

interface DashboardSidebarWorkspaceLeadIndicatorProps {
	workspaceStatus: ActivePaneStatus | null;
	isCreatePending: boolean;
	sandboxStatus?: DashboardSidebarWorkspace["sandboxStatus"];
	pullRequestState: DashboardSidebarWorkspacePullRequest["state"] | null;
}

/**
 * One glyph by precedence: the sandbox's own state (nothing runs in a dead
 * or unborn box), then live agent state, then PR state, then idle.
 */
type LeadKind =
	| "failed"
	| "creating"
	| "working"
	| "status"
	| "pull-request"
	| "idle";

function pickLead({
	workspaceStatus,
	isCreatePending,
	sandboxStatus,
	pullRequestState,
}: Required<DashboardSidebarWorkspaceLeadIndicatorProps>): {
	leadKind: LeadKind;
	lead: ReactNode;
} {
	if (sandboxStatus === "failed") {
		return { leadKind: "failed", lead: <StatusIndicator status="failed" /> };
	}
	if (isCreatePending || sandboxStatus === "provisioning") {
		return {
			leadKind: "creating",
			lead: <WaveSpinner className="text-muted-foreground/60" />,
		};
	}
	if (workspaceStatus === "working") {
		return {
			leadKind: "working",
			lead: <WaveSpinner className="text-foreground/80" />,
		};
	}
	if (workspaceStatus) {
		return {
			leadKind: "status",
			lead: <StatusIndicator status={workspaceStatus} />,
		};
	}
	if (pullRequestState) {
		const PrIcon = PR_ICON_BY_STATE[pullRequestState];
		return {
			leadKind: "pull-request",
			lead: (
				<PrIcon
					className={cn("size-3", PR_COLOR_BY_STATE[pullRequestState])}
					strokeWidth={2}
				/>
			),
		};
	}
	return {
		leadKind: "idle",
		lead: <span className="size-1.5 rounded-full bg-muted-foreground/50" />,
	};
}

export function DashboardSidebarWorkspaceLeadIndicator({
	workspaceStatus,
	isCreatePending,
	sandboxStatus = null,
	pullRequestState,
}: DashboardSidebarWorkspaceLeadIndicatorProps) {
	const { leadKind, lead } = pickLead({
		workspaceStatus,
		isCreatePending,
		sandboxStatus,
		pullRequestState,
	});
	return (
		<span className="contents" data-lead={leadKind}>
			{lead}
		</span>
	);
}
