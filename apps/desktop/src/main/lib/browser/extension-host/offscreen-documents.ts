import { type Session, WebContentsView } from "electron";
import {
	OFFSCREEN_CHANNEL,
	type OffscreenMethod,
} from "shared/browser-extension-offscreen";

/**
 * `chrome.offscreen` for extension service workers: one hidden page per
 * extension, as in Chrome. Password managers keep DOM work (localStorage,
 * clipboard, workers) in it; without it LastPass's worker dies on `document`.
 */
/** The document's URL, resolved inside the calling extension; any other URL throws. */
export function offscreenDocumentUrl(
	extensionId: string,
	raw: unknown,
): string {
	if (typeof raw !== "string" || raw === "") {
		throw new Error("An offscreen document needs a URL.");
	}
	const url = new URL(raw, `chrome-extension://${extensionId}/`);
	// URL.origin is "null" for every chrome-extension:, file: and data: URL, so compare the parts.
	if (
		url.protocol !== "chrome-extension:" ||
		url.hostname !== extensionId ||
		url.port ||
		url.username ||
		url.password
	) {
		throw new Error("The offscreen document must be in the extension.");
	}
	return url.href;
}

export function serveOffscreenDocuments(session: Session): void {
	const documents = new Map<string, Electron.WebContents>();
	const served = new WeakSet<Electron.ServiceWorkerMain>();

	const createDocument = async (extensionId: string, params: unknown) => {
		if (documents.has(extensionId)) {
			throw new Error("Only a single offscreen document may be created.");
		}
		const url = offscreenDocumentUrl(
			extensionId,
			(params as { url?: unknown })?.url,
		);
		const { webContents } = new WebContentsView({
			webPreferences: { session, sandbox: true, contextIsolation: true },
		});
		documents.set(extensionId, webContents);
		webContents.once("destroyed", () => {
			if (documents.get(extensionId) === webContents) {
				documents.delete(extensionId);
			}
		});
		try {
			await webContents.loadURL(url);
		} catch (error) {
			webContents.close();
			throw error;
		}
	};

	const closeDocument = (extensionId: string) => {
		const webContents = documents.get(extensionId);
		if (!webContents) throw new Error("No current offscreen document.");
		documents.delete(extensionId);
		webContents.close();
	};

	const call = (
		extensionId: string,
		method: OffscreenMethod,
		params: unknown,
	) => {
		switch (method) {
			case "createDocument":
				return createDocument(extensionId, params);
			case "closeDocument":
				return closeDocument(extensionId);
			case "hasDocument":
				return documents.has(extensionId);
		}
	};

	session.extensions.on("extension-unloaded", (_event, extension) => {
		const webContents = documents.get(extension.id);
		if (!webContents) return;
		documents.delete(extension.id);
		webContents.close();
	});

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
		worker.ipc.handle(OFFSCREEN_CHANNEL, (_event, method, params) =>
			call(extensionId, method, params),
		);
	});
}
