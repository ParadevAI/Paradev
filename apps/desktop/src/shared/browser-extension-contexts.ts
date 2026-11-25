export const CONTEXTS_CHANNEL = "browser-extension-contexts";

/** The context types this app can host; Chrome also has SIDE_PANEL and DEVELOPER_TOOLS. */
export type ExtensionContextType =
	| "BACKGROUND"
	| "TAB"
	| "POPUP"
	| "OFFSCREEN_DOCUMENT";

/** `chrome.runtime.ExtensionContext`, minus the document ids the app has no source for. */
export interface ExtensionContext {
	contextId: string;
	contextType: ExtensionContextType;
	documentOrigin?: string;
	documentUrl?: string;
	frameId: number;
	incognito: boolean;
	tabId: number;
	windowId: number;
}

export interface ExtensionContextFilter {
	contextIds?: string[];
	contextTypes?: ExtensionContextType[];
	documentIds?: string[];
	documentOrigins?: string[];
	documentUrls?: string[];
	frameIds?: number[];
	incognito?: boolean;
	tabIds?: number[];
	windowIds?: number[];
}
