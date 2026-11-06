import type {
	Pane,
	PaneRegistry,
	RendererContext,
	Tab,
	WorkspaceStore,
} from "@superset/panes";
import { Terminal } from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useTerminalAgentStatuses } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import { getHighestPriorityStatus } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import { BrowserTabFavicon } from "../../hooks/usePaneRegistry/components/BrowserPane/components/BrowserTabFavicon";
import type {
	BrowserPaneData,
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import { TabIconCard } from "./components/TabIconCard";
import {
	AGENT_CARD_COLORS,
	CARD_PEEK_PX,
	CARD_WIDTH_PX,
	MAX_TAB_ICONS,
} from "./constants";
import { cardStatuses } from "./utils/cardStatuses";
import { orderTabPanes } from "./utils/orderTabPanes";

const NO_ACTIONS: RendererContext<PaneViewerData>["actions"] = {
	close: () => {},
	focus: () => {},
	setTitle: () => {},
	pin: () => {},
	updateData: () => {},
	split: () => {},
};

interface TabIconStackProps {
	tab: Tab<PaneViewerData>;
	registry: PaneRegistry<PaneViewerData>;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}

/**
 * A card per pane, up to five: the focused pane in front, then the others in
 * layout order. An agent's terminal or chat shows the agent's logo; other
 * panes show the icon their pane header shows.
 */
export function TabIconStack({
	tab,
	registry,
	store,
	workspaceId,
}: TabIconStackProps) {
	const bindings = useTerminalAgentBindings(workspaceId);
	const statuses = useTerminalAgentStatuses(workspaceId);
	const isDark = useIsDarkTheme();
	const ordered = orderTabPanes(tab);
	const panes = ordered.slice(0, MAX_TAB_ICONS);
	if (panes.length === 0) return null;
	const statusByCard = cardStatuses(
		ordered,
		MAX_TAB_ICONS,
		(pane) =>
			getHighestPriorityStatus(
				getV2NotificationSourcesForPane(pane).map((source) =>
					statuses.get(source.id),
				),
			) ?? undefined,
	);

	const agentIdOf = (pane: Pane<PaneViewerData>) => {
		if (pane.kind === "chat-v3") {
			const data = pane.data as ChatPaneData;
			return data.agent?.id ?? bindings.get(data.terminalId)?.agentId;
		}
		if (pane.kind === "terminal") {
			return bindings.get((pane.data as TerminalPaneData).terminalId)?.agentId;
		}
		return undefined;
	};

	const renderCard = (pane: Pane<PaneViewerData>, depth: number) => {
		const agentId = agentIdOf(pane);
		const agentIcon = agentId ? getPresetIcon(agentId, isDark) : undefined;
		if (agentId && agentIcon) {
			return (
				<TabIconCard
					key={pane.id}
					depth={depth}
					color={AGENT_CARD_COLORS[agentId]}
					status={statusByCard[depth]}
				>
					<img src={agentIcon} alt="" draggable={false} />
				</TabIconCard>
			);
		}
		if (pane.kind === "terminal" || pane.kind === "chat-v3") {
			return (
				<TabIconCard key={pane.id} depth={depth} status={statusByCard[depth]}>
					<Terminal strokeWidth={2.5} />
				</TabIconCard>
			);
		}
		if (pane.kind === "browser") {
			const { url, faviconUrl = null } = pane.data as BrowserPaneData;
			return (
				<TabIconCard key={pane.id} depth={depth} status={statusByCard[depth]}>
					<BrowserTabFavicon key={`${url}|${faviconUrl}`} src={faviconUrl} />
				</TabIconCard>
			);
		}
		return (
			<TabIconCard key={pane.id} depth={depth} status={statusByCard[depth]}>
				{registry[pane.kind]?.getIcon?.({
					pane: { ...pane, parentDirection: null },
					tab: { ...tab, position: 0 },
					isActive: depth === 0,
					store,
					actions: NO_ACTIONS,
					headerActions: null,
				})}
			</TabIconCard>
		);
	};

	return (
		<span
			aria-hidden="true"
			className="relative block h-[18px] shrink-0"
			style={{ width: CARD_WIDTH_PX + (panes.length - 1) * CARD_PEEK_PX }}
		>
			{panes.map(renderCard)}
		</span>
	);
}
