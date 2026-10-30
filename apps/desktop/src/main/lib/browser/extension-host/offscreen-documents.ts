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
export function serveOffscreenDocuments(session: Session): void {
	const documents = new Map<string, Electron.WebContents>();
	const served = new WeakSet<Electron.ServiceWorkerMain>();

	const createDocument = async (extensionId: string, params: unknown) => {
		if (documents.has(extensionId)) {
			throw new Error("Only a single offscreen document may be created.");
		}
		const origin = `chrome-extension://${extensionId}/`;
		const url = new URL(String((params as { url?: unknown })?.url), origin);
		if (url.origin !== new URL(origin).origin) {
			throw new Error("The offscreen document must be in the extension.");
		}
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
			await webContents.loadURL(url.href);
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
