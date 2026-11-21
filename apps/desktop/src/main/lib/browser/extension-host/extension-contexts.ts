import type { Session } from "electron";
import {
	CONTEXTS_CHANNEL,
	type ExtensionContext,
	type ExtensionContextFilter,
	type ExtensionContextType,
} from "shared/browser-extension-contexts";

/** A page the app hosts for an extension, as `chrome.runtime.getContexts` sees it. */
export interface ExtensionView {
	contextType: Exclude<ExtensionContextType, "BACKGROUND">;
	contextId: string;
	url: string;
	/** `-1` when the page is not one of the extension's tabs. */
	tabId: number;
	windowId: number;
}

const NO_ID = -1;

function originOf(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		// URL.origin is "null" for chrome-extension:, which Chrome reports whole.
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return undefined;
	}
}

/**
 * The extension's own pages, plus its service worker.
 *
 * An extension asks this to find out whether its popup is already open before
 * opening another, and MV3 code reaches for it before the older
 * `chrome.extension.getViews`, which cannot work here at all: that one answers
 * with `Window` objects, and an extension page lives in another process.
 */
export function collectExtensionContexts(
	views: ExtensionView[],
	filter?: ExtensionContextFilter,
): ExtensionContext[] {
	const background: ExtensionContext = {
		contextId: "background",
		contextType: "BACKGROUND",
		frameId: NO_ID,
		incognito: false,
		tabId: NO_ID,
		windowId: NO_ID,
	};
	const contexts = [
		background,
		...views.map(
			({ contextType, contextId, url, tabId, windowId }): ExtensionContext => ({
				contextId,
				contextType,
				documentOrigin: originOf(url),
				documentUrl: url,
				// Only top-level documents are hosted; a subframe has no context here.
				frameId: 0,
				incognito: false,
				tabId,
				windowId,
			}),
		),
	];
	return contexts.filter((context) => matchesFilter(context, filter));
}

function matchesFilter(
	context: ExtensionContext,
	filter?: ExtensionContextFilter,
): boolean {
	if (!filter) return true;
	const listed = <T>(values: T[] | undefined, value: T | undefined) =>
		!Array.isArray(values) || (value !== undefined && values.includes(value));
	return (
		listed(filter.contextIds, context.contextId) &&
		listed(filter.contextTypes, context.contextType) &&
		listed(filter.documentOrigins, context.documentOrigin) &&
		listed(filter.documentUrls, context.documentUrl) &&
		listed(filter.frameIds, context.frameId) &&
		listed(filter.tabIds, context.tabId) &&
		listed(filter.windowIds, context.windowId) &&
		// The app mints no document ids, so a filter on one matches nothing.
		!Array.isArray(filter.documentIds) &&
		(filter.incognito === undefined || filter.incognito === context.incognito)
	);
}

/**
 * Serves `chrome.runtime.getContexts` to each extension's service worker, which
 * is where an extension asks about its own pages.
 */
export function serveExtensionContexts(
	session: Session,
	viewsOf: (extensionId: string) => ExtensionView[],
): void {
	const served = new WeakSet<Electron.ServiceWorkerMain>();
	session.serviceWorkers.on("running-status-changed", ({ versionId }) => {
		const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
		if (
			!worker?.scope.startsWith("chrome-extension://") ||
			served.has(worker)
		) {
			return;
		}
		served.add(worker);
		const extensionId = new URL(worker.scope).host;
		worker.ipc.handle(CONTEXTS_CHANNEL, (_event, filter) =>
			collectExtensionContexts(
				viewsOf(extensionId),
				filter as ExtensionContextFilter | undefined,
			),
		);
	});
}
