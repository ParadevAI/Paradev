import { createContext, useContext } from "react";

const WorkspacePreviewContext = createContext<
	((workspaceId: string) => void) | null
>(null);

/** Opens a workspace's chat beside the thread, for what the thread renders into. */
export const WorkspacePreviewProvider = WorkspacePreviewContext.Provider;

/** Null where there is no place to preview a workspace: a link then opens it whole. */
export const useWorkspacePreview = () => useContext(WorkspacePreviewContext);
