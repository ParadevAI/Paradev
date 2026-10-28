import type { RendererContext } from "@superset/panes";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type { ReactNode } from "react";
import { useFileTreeVisibilityStore } from "../../../../state/fileTreeVisibilityStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { FileViewFloatingActions } from "./components/FileViewFloatingActions";
import { FileViewTree } from "./components/FileViewTree";

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
	const tabHasTreePane =
		context.pane.kind !== "files" &&
		Object.values(context.tab.panes).some((pane) => pane.kind === "files");
	if (!showTree || tabHasTreePane) return children;
	return (
		<div className="relative h-full w-full min-w-0">
			<ResizablePanelGroup direction="horizontal">
				<ResizablePanel id="file-view-content" order={1} minSize={30}>
					<div className="relative h-full min-w-0">{children}</div>
				</ResizablePanel>
				{visible && (
					<>
						<ResizableHandle />
						<ResizablePanel
							id="file-view-tree"
							order={2}
							defaultSize={35}
							minSize={20}
							maxSize={60}
						>
							<div className="flex h-full min-w-0 flex-col pt-11">
								<FileViewTree
									context={context}
									workspaceId={workspaceId}
									onSearch={onSearch}
								/>
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
