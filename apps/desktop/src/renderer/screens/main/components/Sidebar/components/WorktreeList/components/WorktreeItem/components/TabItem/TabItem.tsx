import { Button } from "@superset/ui/button";
import { SquareTerminal, X } from "lucide-react";
import type { Tab } from "shared/types";

interface TabItemProps {
	tab: Tab;
	worktreeId: string;
	tabGroupId: string;
	selectedTabId: string | undefined;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabRemove?: (tabId: string) => void;
}

export function TabItem({
	tab,
	worktreeId,
	tabGroupId,
	selectedTabId,
	onTabSelect,
	onTabRemove,
}: TabItemProps) {
	const handleRemove = (e: React.MouseEvent) => {
		e.stopPropagation();
		onTabRemove?.(tab.id);
	};

	return (
		<button
			type="button"
			className={`group flex items-center gap-1 w-full h-8 px-3 text-sm rounded-md [transition:all_0.2s,border_0s] ${
				selectedTabId === tab.id
					? "bg-neutral-800 border border-neutral-700"
					: ""
			}`}
			onClick={() => onTabSelect(worktreeId, tabGroupId, tab.id)}
		>
			<div className="flex items-center gap-2 flex-1">
				<SquareTerminal size={14} />
				<span className="truncate">{tab.name}</span>
			</div>
			<Button
				variant="ghost"
				size="icon"
				onClick={handleRemove}
				className="h-5 w-5 p-0 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-neutral-700"
			>
				<X size={12} />
			</Button>
		</button>
	);
}
