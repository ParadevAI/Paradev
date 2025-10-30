import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	FolderOutput,
	FolderTree,
	SquareTerminal,
	X,
	ExternalLink,
	Network,
} from "lucide-react";
import type { Tab, Worktree } from "shared/types";
import { useEffect, useState } from "react";

interface TabItemProps {
	tab: Tab;
	worktreeId: string;
	worktree?: Worktree;
	workspaceId?: string;
	selectedTabId: string | undefined;
	selectedTabIds: Set<string>;
	parentTabId?: string; // The parent group tab ID (if this tab is inside a group)
	onTabSelect: (worktreeId: string, tabId: string, shiftKey: boolean) => void;
	onTabRemove?: (tabId: string) => void;
	onGroupTabs?: (tabIds: string[]) => void;
	onMoveOutOfGroup?: (tabId: string, parentTabId: string) => void;
}

export function TabItem({
	tab,
	worktreeId,
	worktree,
	workspaceId,
	selectedTabId,
	selectedTabIds,
	parentTabId,
	onTabSelect,
	onTabRemove,
	onGroupTabs,
	onMoveOutOfGroup,
}: TabItemProps) {
	const [proxyStatus, setProxyStatus] = useState<
		Array<{
			canonical: number;
			target?: number;
			service?: string;
			active: boolean;
		}>
	>([]);

	// Fetch proxy status for port tabs
	useEffect(() => {
		if (tab.type !== "port") return;

		const fetchProxyStatus = async () => {
			try {
				const status = await window.ipcRenderer.invoke("proxy-get-status");
				setProxyStatus(status || []);
			} catch (error) {
				console.error("Failed to fetch proxy status:", error);
			}
		};

		fetchProxyStatus();
		const interval = setInterval(fetchProxyStatus, 3000);
		return () => clearInterval(interval);
	}, [tab.type]);

	const handleRemove = (e: React.MouseEvent) => {
		e.stopPropagation();
		onTabRemove?.(tab.id);
	};

	const handleClick = (e: React.MouseEvent) => {
		onTabSelect(worktreeId, tab.id, e.shiftKey);
	};

	const handleOpenPort = (e: React.MouseEvent) => {
		e.stopPropagation();

		if (tab.type !== "port" || !worktree) return;

		const detectedPorts = worktree.detectedPorts || {};
		const portEntries = Object.entries(detectedPorts);

		if (portEntries.length === 0) return;

		// Get active proxies and create map
		const activeProxies = proxyStatus.filter((p) => p.active && p.target);
		const proxyMap = new Map(activeProxies.map((p) => [p.target, p.canonical]));

		// Open first detected port
		const [_service, port] = portEntries[0];
		const canonicalPort = proxyMap.get(port);
		const url = canonicalPort
			? `http://localhost:${canonicalPort}`
			: `http://localhost:${port}`;

		window.ipcRenderer.invoke("shell-open-external", url);
	};

	const handleGroupSelected = () => {
		if (onGroupTabs && selectedTabIds.size > 1) {
			onGroupTabs(Array.from(selectedTabIds));
		}
	};

	const handleMoveOut = () => {
		if (onMoveOutOfGroup && parentTabId) {
			onMoveOutOfGroup(tab.id, parentTabId);
		}
	};

	const isSelected = selectedTabId === tab.id;
	const isMultiSelected = selectedTabIds.has(tab.id);
	const showMultiSelectHighlight = isMultiSelected && selectedTabIds.size > 1;
	const isInsideGroup = !!parentTabId;
	const isPortTab = tab.type === "port";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					className={`group flex items-center gap-1 w-full h-8 px-3 text-sm rounded-md [transition:all_0.2s,border_0s] ${
						isSelected
							? "bg-neutral-800 border border-neutral-700"
							: showMultiSelectHighlight
								? "bg-blue-900/30 border border-blue-700/50"
								: ""
					}`}
					onClick={handleClick}
				>
					<div className="flex items-center gap-2 flex-1">
						{isPortTab ? <Network size={14} /> : <SquareTerminal size={14} />}
						<span className="truncate">{tab.name}</span>
					</div>
					{isPortTab ? (
						<Button
							variant="ghost"
							size="icon"
							onClick={handleOpenPort}
							className="h-5 w-5 p-0 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-neutral-700"
						>
							<ExternalLink size={12} />
						</Button>
					) : (
						<Button
							variant="ghost"
							size="icon"
							onClick={handleRemove}
							className="h-5 w-5 p-0 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-neutral-700"
						>
							<X size={12} />
						</Button>
					)}
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				{isInsideGroup && (
					<ContextMenuItem onClick={handleMoveOut}>
						<FolderOutput size={14} className="mr-2" />
						Move Out of Group
					</ContextMenuItem>
				)}
				{selectedTabIds.size > 1 && (
					<ContextMenuItem onClick={handleGroupSelected}>
						<FolderTree size={14} className="mr-2" />
						Group {selectedTabIds.size} Tabs
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
