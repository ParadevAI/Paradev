import type { SubagentPaneData } from "../../../../../../types";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../../../hooks/useSurfaceFork";
import { AccountUsage } from "../../../AccountUsage";
import { TerminalConnectionIndicator } from "./components/TerminalConnectionIndicator";
import { TerminalIdCopyMenu } from "./components/TerminalIdCopyMenu";
import { TerminalPageWatchChip } from "./components/TerminalPageWatchChip";
import { TerminalSessionHandoffMenu } from "./components/TerminalSessionHandoffMenu";
import { TerminalSubagentsMenu } from "./components/TerminalSubagentsMenu";

interface TerminalPaneHeaderExtrasProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	onNewShell: () => Promise<void>;
	onCreateNewAgentSession: (input: {
		configId: string;
		placement: "split-pane" | "new-tab";
		prompt: string;
		forkSessionId?: string;
	}) => Promise<{ terminalId: string } | null>;
	/** Open (or focus) the live transcript pane for one of this agent's subagents. */
	onOpenSubagent: (data: SubagentPaneData) => void;
	onForkIntoOtherSurface: (
		source: SurfaceForkSource,
		placement: SurfaceForkPlacement,
	) => void;
}

export function TerminalPaneHeaderExtras({
	workspaceId,
	terminalId,
	terminalInstanceId,
	onCreateNewAgentSession,
	onForkIntoOtherSurface,
	onOpenSubagent,
	onNewShell,
}: TerminalPaneHeaderExtrasProps) {
	return (
		<div className="flex items-center gap-1">
			<AccountUsage
				key={`${workspaceId}:${terminalId}`}
				workspaceId={workspaceId}
				terminalId={terminalId}
			/>
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
			<TerminalIdCopyMenu workspaceId={workspaceId} terminalId={terminalId} />
			<TerminalSessionHandoffMenu
				workspaceId={workspaceId}
				terminalId={terminalId}
				onCreateNewAgentSession={onCreateNewAgentSession}
				onForkIntoOtherSurface={onForkIntoOtherSurface}
			/>
		</div>
	);
}
