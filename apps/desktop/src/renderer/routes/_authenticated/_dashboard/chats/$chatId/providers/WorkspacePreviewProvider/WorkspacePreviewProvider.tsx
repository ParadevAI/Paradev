import { createContext, useContext } from "react";

/** Opens something a message links to beside the thread. */
export interface Preview {
	openWorkspace: (workspaceId: string) => void;
	openPage: (slug: string) => void;
}

const PreviewContext = createContext<Preview | null>(null);

export const WorkspacePreviewProvider = PreviewContext.Provider;

/** Null where there is no place to preview: a link then opens its target whole. */
export const usePreview = () => useContext(PreviewContext);
