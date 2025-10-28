import { memo, useEffect, useRef, useState } from "react";
import type { Tab, TabGroup } from "shared/types";
import Terminal from "./Terminal";

interface ScreenLayoutProps {
	tabGroup: TabGroup;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	selectedTabId?: string;
	onTabFocus: (tabId: string) => void;
}

interface TerminalInstanceProps {
	tab: Tab;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	tabGroupId: string;
	onTabFocus: (tabId: string) => void;
}

const TerminalInstance = memo(function TerminalInstance({
	tab,
	workingDirectory,
	workspaceId,
	worktreeId,
	tabGroupId,
	onTabFocus,
}: TerminalInstanceProps) {
	// Use the stable tab.id as the terminal ID
	const terminalId = tab.id;
	// Track if we've attempted to create this terminal in this mount
	const terminalCreatedRef = useRef(false);
	// Trigger fit when position changes
	const [fitTrigger, setFitTrigger] = useState(0);

	console.log(`[TerminalInstance] Rendering tab ${tab.id} at position (${tab.row}, ${tab.col})`);

	useEffect(() => {
		console.log(`[TerminalInstance] useEffect triggered for tab ${tab.id}, created: ${terminalCreatedRef.current}`);

		// Prevent double creation - only create once per component mount
		if (terminalCreatedRef.current) {
			console.log(`[TerminalInstance] Skipping creation for tab ${tab.id} - already created`);
			return;
		}

		// Mark that we're creating/have created the terminal
		terminalCreatedRef.current = true;
		console.log(`[TerminalInstance] Creating terminal for tab ${tab.id}`);

		// Create terminal instance with the tab.id as the terminal ID
		const createTerminal = async () => {
			try {
				// Use saved CWD if available, otherwise use workingDirectory
				// Ensure we always have a valid directory
				const initialCwd = tab.cwd || workingDirectory;

				if (!initialCwd) {
					console.error(
						"[ScreenLayout] No CWD available for tab",
						tab.id,
					);
					return;
				}

				// Pass the stable tab.id as the terminal ID
				// If terminal already exists in backend, it will reuse it
				console.log(`[TerminalInstance] Invoking terminal-create for tab ${tab.id}`);
				const result = await window.ipcRenderer.invoke("terminal-create", {
					id: tab.id, // Use tab.id as the stable terminal identifier
					cwd: initialCwd,
				});
				console.log(`[TerminalInstance] Terminal created/reused for tab ${tab.id}, result:`, result);

				// Execute startup command if specified
				if (tab.command) {
					setTimeout(() => {
						window.ipcRenderer.invoke("terminal-execute-command", {
							id: tab.id,
							command: tab.command,
						});
					}, 500); // Small delay to ensure terminal is ready
				}
			} catch (error) {
				console.error("Failed to create terminal:", error);
			}
		};

		createTerminal();

		// No cleanup function - terminals persist in the backend
		// They will only be killed when explicitly removed from the config
		// This prevents terminals from being killed during reordering
	}, [tab.id]);

	// Listen for CWD changes from the main process
	useEffect(() => {
		if (!terminalId || !workspaceId || !worktreeId || !tabGroupId) return;

		const handleCwdChange = async (data: { id: string; cwd: string }) => {
			// Only handle changes for this terminal
			if (data.id !== terminalId) return;

			// Save the new CWD to the workspace config (tab IS the terminal)
			try {
				await window.ipcRenderer.invoke("workspace-update-terminal-cwd", {
					workspaceId,
					worktreeId,
					tabGroupId,
					tabId: tab.id,
					cwd: data.cwd,
				});
			} catch (error) {
				console.error("Failed to save terminal CWD:", error);
			}
		};

		window.ipcRenderer.on("terminal-cwd-changed", handleCwdChange);

		return () => {
			window.ipcRenderer.off("terminal-cwd-changed", handleCwdChange);
		};
	}, [terminalId, tab.id, workspaceId, worktreeId, tabGroupId]);

	// Trigger fit when tab position changes (row or col)
	useEffect(() => {
		console.log(`[TerminalInstance] Position changed for tab ${tab.id}, triggering fit`);
		setFitTrigger((prev) => prev + 1);
	}, [tab.row, tab.col]);

	const handleFocus = () => {
		onTabFocus(tab.id);
	};

	return (
		<div className="w-full h-full">
			<Terminal terminalId={terminalId} onFocus={handleFocus} triggerFit={fitTrigger} />
		</div>
	);
}, (prevProps, nextProps) => {
	// Return true if props are equal (skip re-render)
	// Return false if props are different (do re-render)
	// We need to re-render when row/col changes to trigger fit
	const isEqual = (
		prevProps.tab.id === nextProps.tab.id &&
		prevProps.tab.row === nextProps.tab.row &&
		prevProps.tab.col === nextProps.tab.col &&
		prevProps.workspaceId === nextProps.workspaceId &&
		prevProps.worktreeId === nextProps.worktreeId &&
		prevProps.tabGroupId === nextProps.tabGroupId
	);

	console.log(`[TerminalInstance] memo comparison for tab ${nextProps.tab.id}:`, {
		isEqual,
		idChanged: prevProps.tab.id !== nextProps.tab.id,
		rowChanged: prevProps.tab.row !== nextProps.tab.row,
		colChanged: prevProps.tab.col !== nextProps.tab.col,
		prevPos: `(${prevProps.tab.row}, ${prevProps.tab.col})`,
		nextPos: `(${nextProps.tab.row}, ${nextProps.tab.col})`,
	});

	return isEqual;
});

export default function ScreenLayout({
	tabGroup,
	workingDirectory,
	workspaceId,
	worktreeId,
	selectedTabId,
	onTabFocus,
}: ScreenLayoutProps) {
	// Safety check: ensure tabGroup has tabs
	if (!tabGroup || !tabGroup.tabs || !Array.isArray(tabGroup.tabs)) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>Invalid tab group structure</p>
					<p className="text-sm text-gray-500 mt-2">
						Please rescan worktrees or create a new tab group
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="w-full h-full gap-1 p-1"
			style={{
				display: "grid",
				gridTemplateRows: `repeat(${tabGroup.rows}, 1fr)`,
				gridTemplateColumns: `repeat(${tabGroup.cols}, 1fr)`,
			}}
		>
			{tabGroup.tabs.map((tab) => {
				const isActive = selectedTabId === tab.id;
				return (
					<div
						key={tab.id}
						className={`overflow-hidden rounded border ${
							isActive
								? "border-blue-500 ring-2 ring-blue-500/50"
								: "border-neutral-800"
						}`}
						style={{
							gridRow: `${tab.row + 1} / span ${tab.rowSpan || 1}`,
							gridColumn: `${tab.col + 1} / span ${tab.colSpan || 1}`,
						}}
					>
						<TerminalInstance
							tab={tab}
							workingDirectory={workingDirectory}
							workspaceId={workspaceId}
							worktreeId={worktreeId}
							tabGroupId={tabGroup.id}
							onTabFocus={onTabFocus}
						/>
					</div>
				);
			})}
		</div>
	);
}
