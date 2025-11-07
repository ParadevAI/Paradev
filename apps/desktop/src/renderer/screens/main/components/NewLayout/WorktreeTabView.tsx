import { GitBranch, Globe, Terminal as TerminalIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { SidebarHeader } from "./SidebarHeader";
import { BrowserView } from "./views/BrowserView";
import { GitView } from "./views/GitView";
import { SummaryView } from "./views/SummaryView";
import { TerminalsView } from "./views/TerminalsView";

type TabType = "git" | "summary" | "terminals" | "browser";

interface Tab {
	id: TabType;
	label: string;
	icon: React.ReactNode;
}

const TABS: Tab[] = [
	{ id: "git", label: "Git", icon: <GitBranch size={14} /> },
	{ id: "summary", label: "Summary", icon: <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> },
	{ id: "terminals", label: "Terminals", icon: <TerminalIcon size={14} /> },
	{ id: "browser", label: "Browser", icon: <Globe size={14} /> },
];

export const WorktreeTabView: React.FC = () => {
	const [activeTab, setActiveTab] = useState<TabType>("summary");

	const renderTabContent = () => {
		switch (activeTab) {
			case "git":
				return <GitView />;
			case "summary":
				return <SummaryView />;
			case "terminals":
				return <TerminalsView />;
			case "browser":
				return <BrowserView />;
			default:
				return null;
		}
	};

	return (
		<div className="flex flex-col h-full w-full select-none text-neutral-300">
			{/* Sidebar header with collapse/settings */}
			<SidebarHeader />

			{/* Tab selector */}
			<div className="flex items-center border-b border-neutral-700 px-3 py-2 gap-1">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={`
							flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm h-8
							${
								activeTab === tab.id
									? "bg-neutral-800 text-white border border-neutral-700"
									: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
							}
						`}
					>
						{tab.icon}
						<span>{tab.label}</span>
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-hidden">{renderTabContent()}</div>
		</div>
	);
};
