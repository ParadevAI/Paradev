import type {
	PaneLayoutNode,
	PaneLayoutSidebar,
	PaneLayoutSnapshot,
	PaneLayoutTab,
} from "@superset/shared/pane-layout-ops";

export function formatAgent(
	agent: { id: string; state: string } | null | undefined,
): string | null {
	return agent ? `${agent.id} · ${agent.state}` : null;
}

function describePane(pane: PaneLayoutTab["panes"][number]): string {
	const title = pane.terminalTitle ?? pane.title;
	const agent = formatAgent(pane.agent);
	return [
		pane.id,
		pane.kind,
		title ? `"${title}"` : null,
		agent,
		pane.terminalId ? `terminal ${pane.terminalId}` : null,
		pane.active ? "(active)" : null,
	]
		.filter(Boolean)
		.join("  ");
}

function formatNode(
	node: PaneLayoutNode,
	tab: PaneLayoutTab,
	depth: number,
): string[] {
	const indent = "  ".repeat(depth);
	if (node.type === "split") {
		const first = Math.round(node.ratio * 100);
		return [
			`${indent}${node.direction} ${first}/${100 - first}`,
			...formatNode(node.first, tab, depth + 1),
			...formatNode(node.second, tab, depth + 1),
		];
	}
	const pane = tab.panes.find((candidate) => candidate.id === node.paneId);
	return [`${indent}${pane ? describePane(pane) : node.paneId}`];
}

function formatTabs(tabs: PaneLayoutTab[]): string[] {
	return tabs.flatMap((tab) => [
		[`tab ${tab.id}`, tab.title ?? "", tab.active ? "(active)" : ""]
			.filter(Boolean)
			.join("\t"),
		...formatNode(tab.layout, tab, 1),
	]);
}

function sidebarState(sidebar: PaneLayoutSidebar): string {
	if (!sidebar.open) return "hidden";
	return sidebar.fullScreen ? "shown, full screen" : "shown";
}

export function formatLayout(layout: PaneLayoutSnapshot): string {
	const { sidebar } = layout;
	if (!sidebar) {
		return layout.tabs.length === 0
			? "No panes open in this workspace."
			: formatTabs(layout.tabs).join("\n");
	}
	return [
		"Main",
		...(layout.tabs.length === 0 ? ["No tabs."] : formatTabs(layout.tabs)),
		"",
		`Sidebar (${sidebarState(sidebar)})`,
		...(sidebar.tabs.length === 0 ? ["No tabs."] : formatTabs(sidebar.tabs)),
	].join("\n");
}
