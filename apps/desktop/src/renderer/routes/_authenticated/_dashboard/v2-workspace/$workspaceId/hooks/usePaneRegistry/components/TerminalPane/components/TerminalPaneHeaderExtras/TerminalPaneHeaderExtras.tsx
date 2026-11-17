import type { SubagentPaneData } from "../../../../../../types";
import { TerminalConnectionIndicator } from "./components/TerminalConnectionIndicator";
import { TerminalPageWatchChip } from "./components/TerminalPageWatchChip";
import { TerminalSubagentsMenu } from "./components/TerminalSubagentsMenu";

interface TerminalPaneHeaderExtrasProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	onNewShell: () => Promise<void>;
	/** Open (or focus) the live transcript pane for one of this agent's subagents. */
	onOpenSubagent: (data: SubagentPaneData) => void;
}

export function TerminalPaneHeaderExtras({
	workspaceId,
	terminalId,
	terminalInstanceId,
	onOpenSubagent,
	onNewShell,
}: TerminalPaneHeaderExtrasProps) {
	return (
		<div className="flex items-center gap-1">
			<TerminalSubagentsMenu
				workspaceId={workspaceId}
				terminalId={terminalId}
				onOpenSubagent={onOpenSubagent}
			/>
			<TerminalConnectionIndicator
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
				onNewShell={onNewShell}
			/>
			<TerminalPageWatchChip
				workspaceId={workspaceId}
				terminalId={terminalId}
			/>
		</div>
	);
}
