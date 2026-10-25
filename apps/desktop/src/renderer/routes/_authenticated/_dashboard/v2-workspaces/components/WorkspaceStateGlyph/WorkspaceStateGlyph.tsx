import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	BOARD_COLUMN_LABELS,
	deriveBoardColumn,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import {
	getStatusTooltip,
	StatusIndicator,
} from "renderer/screens/main/components/StatusIndicator/StatusIndicator";

interface WorkspaceStateGlyphProps {
	workspace: AccessibleV2Workspace;
}

/**
 * Row state glyph, by precedence: the sandbox's own state (nothing runs in a
 * dead or unborn box), then live agent states (pulse), then the finished
 * dot the sidebar rows and tab accessories use, then the section headers'
 * icon set so the vocabulary matches at both levels.
 */
export function WorkspaceStateGlyph({ workspace }: WorkspaceStateGlyphProps) {
	const { t } = useLingui();
	const { agentStatus, sandboxStatus } = workspace;

	let glyph: React.ReactNode;
	let label: string;
	if (sandboxStatus === "failed") {
		glyph = <StatusIndicator status="failed" />;
		label = t({ message: "Sandbox stopped responding" });
	} else if (sandboxStatus === "provisioning") {
		glyph = <WaveSpinner className="text-muted-foreground/60" />;
		label = t({ message: "Creating the sandbox" });
	} else if (
		agentStatus === "working" ||
		agentStatus === "permission" ||
		agentStatus === "failed"
	) {
		glyph = <StatusIndicator status={agentStatus} />;
		label = getStatusTooltip(agentStatus);
	} else {
		const column = deriveBoardColumn(workspace);
		if (column === "finished") {
			glyph = <StatusIndicator status="review" />;
			label = getStatusTooltip("review");
		} else {
			glyph = <BoardColumnIcon column={column} />;
			label = i18n._(BOARD_COLUMN_LABELS[column]);
		}
	}

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span className="flex size-4 shrink-0 items-center justify-center">
					{glyph}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}
