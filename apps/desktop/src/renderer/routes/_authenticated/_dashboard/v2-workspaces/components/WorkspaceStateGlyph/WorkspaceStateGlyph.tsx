import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuInfo } from "react-icons/lu";
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

export function WorkspaceStateGlyph({ workspace }: WorkspaceStateGlyphProps) {
	const { t } = useLingui();
	const { agentStatus, sandboxStatus } = workspace;

	let glyph: React.ReactNode;
	let label: string;
	if (sandboxStatus === "failed") {
		glyph = <LuInfo className="size-3.5 text-red-400" />;
		label = t({ message: "Sandbox stopped responding" });
	} else if (sandboxStatus === "provisioning") {
		glyph = <WaveSpinner className="text-muted-foreground/60" />;
		label = t({ message: "Creating the sandbox" });
	} else if (agentStatus === "working") {
		glyph = <WaveSpinner className="text-amber-500" />;
		label = getStatusTooltip(agentStatus);
	} else if (agentStatus === "failed") {
		glyph = <LuInfo className="size-3.5 text-red-400" />;
		label = getStatusTooltip(agentStatus);
	} else if (agentStatus === "permission") {
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
