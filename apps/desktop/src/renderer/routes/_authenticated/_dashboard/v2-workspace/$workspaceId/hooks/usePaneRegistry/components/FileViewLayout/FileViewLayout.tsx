import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useFileTreeVisibilityStore } from "../../../../state/fileTreeVisibilityStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { openFileFromTree } from "../../../../utils/openFileFromTree";
import { useElementWidth } from "../../hooks/useElementWidth";
import { FileBreadcrumb } from "./components/FileBreadcrumb";
import { FileViewFloatingActions } from "./components/FileViewFloatingActions";
import { FileViewTree } from "./components/FileViewTree";

const TREE_DEFAULT_SIZE = 35;
const TREE_TOGGLE_MS = 200;
const SIDE_BY_SIDE_MIN_WIDTH = 420;
const NARROW_LAYOUTS: Record<"tree" | "split" | "file", number[]> = {
	tree: [0, 100],
	split: [50, 50],
	file: [100, 0],
};

interface FileViewLayoutProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	showTree: boolean;
	onSearch?: () => void;
	children?: ReactNode;
}

export function FileViewLayout({
	context,
	workspaceId,
	showTree,
	onSearch,
	children,
}: FileViewLayoutProps) {
	const filePath =
		context.pane.kind === "file"
			? (context.pane.data as FilePaneData).filePath
			: undefined;
	const storedVisible = useFileTreeVisibilityStore((state) => state.visible);
	const setVisible = useFileTreeVisibilityStore((state) => state.setVisible);
	const narrowVisible = useFileTreeVisibilityStore(
		(state) => state.narrowVisible,
	);
	const setNarrowVisible = useFileTreeVisibilityStore(
		(state) => state.setNarrowVisible,
	);
	const toggleNarrow = useFileTreeVisibilityStore(
		(state) => state.toggleNarrow,
	);
	const visible = filePath ? storedVisible : true;
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const treePanelRef = useRef<ImperativePanelHandle>(null);
	const [animating, setAnimating] = useState(false);
	const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
	const width = useElementWidth(rootElement);
	const isNarrow = width !== null && width < SIDE_BY_SIDE_MIN_WIDTH;
	const narrowLayout = !isNarrow
		? null
		: !filePath
			? "tree"
			: narrowVisible
				? "split"
				: "file";
	const isNarrowRef = useRef(isNarrow);
	isNarrowRef.current = isNarrow;
	const visibleRef = useRef(visible);
	visibleRef.current = visible;

	useLayoutEffect(() => {
		const group = groupRef.current;
		if (!group) return;
		if (narrowLayout) {
			group.setLayout(NARROW_LAYOUTS[narrowLayout]);
		} else {
			group.setLayout(
				visibleRef.current
					? [100 - TREE_DEFAULT_SIZE, TREE_DEFAULT_SIZE]
					: [100, 0],
			);
		}
	}, [narrowLayout]);

	useEffect(() => {
		const panel = treePanelRef.current;
		if (isNarrowRef.current || !panel || panel.isExpanded() === visible) return;
		setAnimating(true);
		if (visible) {
			panel.expand();
			if (panel.getSize() < TREE_DEFAULT_SIZE) panel.resize(TREE_DEFAULT_SIZE);
		} else {
			panel.collapse();
		}
		const timer = setTimeout(() => setAnimating(false), TREE_TOGGLE_MS);
		return () => clearTimeout(timer);
	}, [visible]);

	const tabHasTreePane =
		context.pane.kind !== "files" &&
		Object.values(context.tab.panes).some((pane) => pane.kind === "files");
	if (!showTree || tabHasTreePane) return children;

	const panelTransition =
		animating && !isNarrow && "transition-[flex-grow] duration-200 ease-out";
	const treeFillsPane = isNarrow && !filePath;
	return (
		<div
			ref={setRootElement}
			data-file-view
			className="relative h-full w-full min-w-0"
		>
			<ResizablePanelGroup ref={groupRef} direction="horizontal">
				<ResizablePanel
					id="file-view-content"
					order={1}
					minSize={isNarrow ? 0 : 30}
					collapsible={isNarrow}
					collapsedSize={0}
					className={cn(panelTransition)}
				>
					<div className="relative h-full min-w-0">
						{children ?? (
							<div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground/60">
								<Trans>Select a file to view it here</Trans>
							</div>
						)}
					</div>
				</ResizablePanel>
				<ResizableHandle
					className={cn(
						"bg-transparent",
						(isNarrow ? narrowLayout !== "split" : !visible) &&
							"pointer-events-none",
					)}
					onDoubleClick={() =>
						groupRef.current?.setLayout([
							100 - TREE_DEFAULT_SIZE,
							TREE_DEFAULT_SIZE,
						])
					}
				/>
				<ResizablePanel
					id="file-view-tree"
					order={2}
					ref={treePanelRef}
					defaultSize={visible ? TREE_DEFAULT_SIZE : 0}
					minSize={20}
					maxSize={isNarrow ? 100 : 60}
					collapsible={Boolean(filePath) || isNarrow}
					collapsedSize={0}
					onCollapse={() => {
						if (!isNarrowRef.current) setVisible(false);
						else if (filePath) setNarrowVisible(false);
					}}
					onExpand={() => {
						if (!isNarrowRef.current) setVisible(true);
						else if (filePath) setNarrowVisible(true);
					}}
					className={cn(panelTransition)}
				>
					<div
						className={cn(
							"flex h-full min-w-0 flex-col",
							!treeFillsPane && "pt-11",
						)}
					>
						<div
							className={cn(
								"min-h-0 flex-1 overflow-hidden",
								!treeFillsPane &&
									"rounded-tl-lg border-t border-l border-border/60",
							)}
						>
							<FileViewTree
								context={context}
								workspaceId={workspaceId}
								onSearch={onSearch}
							/>
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
			{filePath && (
				<FileBreadcrumb
					workspaceId={workspaceId}
					filePath={filePath}
					onOpenFile={(path) =>
						openFileFromTree({
							store: context.store,
							filePath: path,
							sourcePaneId: context.pane.id,
						})
					}
				/>
			)}
			{filePath && (
				<FileViewFloatingActions
					workspaceId={workspaceId}
					filePath={filePath}
					treeToggle={
						isNarrow
							? { visible: narrowVisible, onToggle: toggleNarrow }
							: undefined
					}
				/>
			)}
		</div>
	);
}
