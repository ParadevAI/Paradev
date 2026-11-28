import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import { startPresetTerminal } from "../../../state/presetLaunches";
import type { PaneViewerData } from "../../../types";
import type { OpenAgentChat } from "../../useAgentSessionLauncher";
import type { TerminalLauncher } from "../../useTerminalLauncher";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

export function launchPresetTab({
	store,
	linkedStores,
	launcher,
	command,
	cwd,
	title,
	tryChat,
}: {
	store: PaneStore;
	linkedStores: PaneStore[];
	launcher: TerminalLauncher;
	command?: string;
	cwd?: string;
	title?: string;
	tryChat?: (
		place: NonNullable<Parameters<OpenAgentChat>[1]>,
	) => ReturnType<OpenAgentChat>;
}) {
	const terminalId = launcher.mint();
	const paneId = `pane-${crypto.randomUUID()}`;
	const locate = () => {
		for (const candidate of [store, ...linkedStores]) {
			const state = candidate.getState();
			const location = state.getPane(paneId);
			if (location?.pane.kind !== "terminal") continue;
			const { data } = location.pane;
			if ("terminalId" in data && data.terminalId === terminalId)
				return { state, ...location };
		}
	};

	return startPresetTerminal(terminalId, async () => {
		store.getState().addTab({
			panes: [
				{
					id: paneId,
					kind: "terminal",
					titleOverride: title,
					data: { terminalId },
				},
			],
		});
		try {
			const chat = await tryChat?.((pane) => {
				const current = locate();
				if (!current) return;
				const { state, tabId, pane: pending } = current;
				if (pending.pinned) state.setPanePinned({ paneId, pinned: false });
				state.replacePane({
					tabId,
					paneId,
					newPane: {
						...pane,
						id: paneId,
						titleOverride: pending.titleOverride ?? pane.titleOverride,
						pinned: pending.pinned,
					},
				});
			});
			if (!chat && locate())
				await launcher.create({ terminalId, command, cwd });
		} catch (error) {
			const current = locate();
			current?.state.closePane({ tabId: current.tabId, paneId });
			throw error;
		}
	});
}
