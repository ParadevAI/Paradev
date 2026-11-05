import {
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import { changesPillStats } from "../../utils/changesPillStats";
import type { SelectedDiffTarget } from "../WorkspaceSidebar/hooks/useChangesTab";
import { ChangesRailPanel } from "./components/ChangesRailPanel";
import {
	DEFAULT_CHANGES_RAIL_WIDTH,
	MIN_CHANGES_RAIL_WIDTH,
} from "./constants";
import { getChangesRailWidth } from "./utils/getChangesRailWidth";

interface ChangesRailProps {
	workspaceId: string;
	suppressed: boolean;
	selectedDiffTarget?: SelectedDiffTarget;
	onSelectFile: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onResizingChange?: (isResizing: boolean) => void;
	children: ReactNode;
}

export function ChangesRail({
	workspaceId,
	suppressed,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	onResizingChange,
	children,
}: ChangesRailProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState<number | null>(null);
	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		setContainerWidth(element.clientWidth);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setContainerWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const { preferences, setChangesRailVisible, setChangesRailWidth } =
		useV2UserPreferences();
	const gitStatus = useWorkspaceGitStatus();
	const stats = useMemo(
		() => (gitStatus.data ? changesPillStats(gitStatus.data) : null),
		[gitStatus.data],
	);
	const rail =
		suppressed || stats === null
			? null
			: getChangesRailWidth({
					enabled: preferences.changesRailVisible,
					changedFileCount: stats.fileCount,
					containerWidth,
					preferredWidth:
						preferences.changesRailWidth ?? DEFAULT_CHANGES_RAIL_WIDTH,
				});

	return (
		<div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{children}
			</div>
			{rail && stats && (
				<ResizablePanel
					width={rail.width}
					onWidthChange={setChangesRailWidth}
					onResizingChange={onResizingChange}
					minWidth={MIN_CHANGES_RAIL_WIDTH}
					maxWidth={rail.maxWidth}
					handleSide="left"
					commitOnRelease
					onDoubleClickHandle={() =>
						setChangesRailWidth(DEFAULT_CHANGES_RAIL_WIDTH)
					}
				>
					<ChangesRailPanel
						workspaceId={workspaceId}
						stats={stats}
						selectedDiffTarget={selectedDiffTarget}
						onSelectFile={onSelectFile}
						onOpenFile={onOpenFile}
						onHide={() => setChangesRailVisible(false)}
					/>
				</ResizablePanel>
			)}
		</div>
	);
}
