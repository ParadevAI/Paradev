import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useEffect } from "react";
import type {
	ChatPaneData,
	OpenFile,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { usePresetTerminalStarting } from "../../../../state/presetLaunches";
import { TerminalPane } from "../TerminalPane";

type ChatOnTerminalPaneData = TerminalPaneData &
	Omit<ChatPaneData, "sessionId"> & {
		agentSurface?: "cli" | "acp";
		acpSessionId?: string | null;
	};

/**
 * Chats used to be shown on the terminal pane. A layout saved then still holds
 * them there, so each one moves to its own chat pane the first time it renders.
 */
export function AgentTerminalPane({
	ctx,
	onOpenFile,
	onRevealPath,
	onNewShell,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string) => void;
	onNewShell: () => Promise<void>;
}) {
	const data = ctx.pane.data as ChatOnTerminalPaneData;
	const starting = usePresetTerminalStarting(data.terminalId);
	const isSavedChat = data.agentSurface === "acp";

	useEffect(() => {
		if (!isSavedChat) return;
		const {
			agentSurface: _surface,
			acpSessionId,
			createOnAttach: _create,
			...chat
		} = data;
		const state = ctx.store.getState();
		state.setPanePinned({ paneId: ctx.pane.id, pinned: false });
		state.replacePane({
			tabId: ctx.tab.id,
			paneId: ctx.pane.id,
			newPane: {
				kind: "chat-v3",
				pinned: ctx.pane.pinned,
				...(ctx.pane.titleOverride
					? { titleOverride: ctx.pane.titleOverride }
					: {}),
				data: { ...chat, sessionId: acpSessionId ?? null } as ChatPaneData,
			},
		});
	}, [
		isSavedChat,
		data,
		ctx.store,
		ctx.tab.id,
		ctx.pane.id,
		ctx.pane.titleOverride,
		ctx.pane.pinned,
	]);

	if (isSavedChat) return null;
	if (starting)
		return (
			<output className="grid h-full place-items-center text-sm text-muted-foreground">
				<Trans>Starting…</Trans>
			</output>
		);

	return (
		<TerminalPane
			ctx={ctx}
			onOpenFile={onOpenFile}
			onRevealPath={onRevealPath}
			onNewShell={onNewShell}
			workspaceId={workspaceId}
		/>
	);
}
