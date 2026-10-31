import type { RendererContext } from "@superset/panes";
import { useState } from "react";
import type { TerminalLauncher } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2TerminalLauncher";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../../../hooks/useSurfaceFork";
import { AccountUsageDot } from "../../../AccountUsageDot";
import { TerminalSessionDropdown } from "./components/TerminalSessionDropdown";
import {
	type SessionAction,
	TerminalSessionHandoffDialog,
} from "./components/TerminalSessionHandoffDialog";
import { TerminalTitleMenuItems } from "./components/TerminalTitleMenuItems";

export function TerminalPaneTitle({
	context,
	launcher,
	workspaceId,
	onSessionRemoved,
	onCreateNewAgentSession,
	onForkIntoOtherSurface,
}: {
	context: RendererContext<PaneViewerData>;
	launcher: TerminalLauncher;
	workspaceId: string;
	onSessionRemoved: (terminalId: string) => void;
	onCreateNewAgentSession: (input: {
		configId: string;
		placement: "split-pane" | "new-tab";
		prompt: string;
		forkSessionId?: string;
	}) => Promise<{ terminalId: string } | null>;
	onForkIntoOtherSurface: (
		source: SurfaceForkSource,
		placement: SurfaceForkPlacement,
	) => void;
}) {
	const { terminalId } = context.pane.data as TerminalPaneData;
	const [sessionAction, setSessionAction] = useState<SessionAction | null>(
		null,
	);
	return (
		<>
			<TerminalSessionDropdown
				context={context}
				launcher={launcher}
				workspaceId={workspaceId}
				onSessionRemoved={onSessionRemoved}
				indicator={
					<AccountUsageDot workspaceId={workspaceId} terminalId={terminalId} />
				}
			>
				<TerminalTitleMenuItems
					workspaceId={workspaceId}
					terminalId={terminalId}
					onSessionAction={setSessionAction}
					onForkIntoOtherSurface={onForkIntoOtherSurface}
				/>
			</TerminalSessionDropdown>
			<TerminalSessionHandoffDialog
				workspaceId={workspaceId}
				terminalId={terminalId}
				action={sessionAction}
				onActionChange={setSessionAction}
				onCreateNewAgentSession={onCreateNewAgentSession}
			/>
		</>
	);
}
