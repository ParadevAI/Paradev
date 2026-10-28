import type { RendererContext } from "@superset/panes";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { type ReactNode, useRef } from "react";
import { useFileTreeVisibilityStore } from "../../../../state/fileTreeVisibilityStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { FileViewFloatingActions } from "./components/FileViewFloatingActions";
import { FileViewTree } from "./components/FileViewTree";

const TREE_DEFAULT_SIZE = 35;

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
	const visible = useFileTreeVisibilityStore((state) => state.visible);
	const groupRef = useRef<React.ComponentRef<typeof ResizablePanelGroup>>(null);
	const tabHasTreePane =
		context.pane.kind !== "files" &&
		Object.values(context.tab.panes).some((pane) => pane.kind === "files");
	if (!showTree || tabHasTreePane) return children;
	return (
		<div className="relative h-full w-full min-w-0">
			<ResizablePanelGroup ref={groupRef} direction="horizontal">
				<ResizablePanel id="file-view-content" order={1} minSize={30}>
					<div className="relative h-full min-w-0">{children}</div>
				</ResizablePanel>
				{visible && (
					<>
						<ResizableHandle
							className="bg-transparent"
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
							defaultSize={TREE_DEFAULT_SIZE}
							minSize={20}
							maxSize={60}
						>
							<div className="flex h-full min-w-0 flex-col pt-11">
								<div className="min-h-0 flex-1 overflow-hidden rounded-tl-lg border-t border-l border-border/60">
									<FileViewTree
										context={context}
										workspaceId={workspaceId}
										onSearch={onSearch}
									/>
								</div>
							</div>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
			<FileViewFloatingActions
				workspaceId={workspaceId}
				filePath={
					context.pane.kind === "file"
						? (context.pane.data as FilePaneData).filePath
						: undefined
				}
			/>
		</div>
	);
}
