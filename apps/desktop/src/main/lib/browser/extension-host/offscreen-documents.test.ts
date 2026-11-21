import { expect, test } from "bun:test";
import {
	offscreenDocumentUrl,
	serveOffscreenDocuments,
} from "./offscreen-documents";

const LASTPASS = "hdokiejnpimakedhajhdlcegeplioahd";
const ONEPASSWORD = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

test("an extension opens only its own page as its offscreen document", () => {
	expect(offscreenDocumentUrl(LASTPASS, "offscreen.html")).toBe(
		`chrome-extension://${LASTPASS}/offscreen.html`,
	);
	for (const url of [
		`chrome-extension://${ONEPASSWORD}/background.html`,
		"file:///etc/passwd",
		"data:text/html,<script>alert(1)</script>",
		"https://attacker.example/",
		`//${ONEPASSWORD}/background.html`,
	]) {
		expect(() => offscreenDocumentUrl(LASTPASS, url)).toThrow(
			"must be in the extension",
		);
	}
});

test("an unloaded extension loses its document, and a document needs a URL", async () => {
	const listeners: Record<string, (...args: unknown[]) => void> = {};
	const on = (event: string, listener: (...args: unknown[]) => void) => {
		listeners[event] = listener;
	};
	let call: (...args: unknown[]) => unknown = () => {};
	const worker = {
		scope: `chrome-extension://${LASTPASS}/`,
		ipc: {
			handle: (_channel: string, handler: typeof call) => {
				call = handler;
			},
		},
	};
	serveOffscreenDocuments({
		extensions: { on },
		serviceWorkers: { on, getWorkerFromVersionID: () => worker },
	} as never);
	listeners["running-status-changed"]?.({ versionId: 1 });

	await call({}, "createDocument", { url: "offscreen.html" });
	expect(await call({}, "hasDocument")).toBe(true);
	listeners["extension-unloaded"]?.({}, { id: LASTPASS });
	expect(await call({}, "hasDocument")).toBe(false);
	await expect(call({}, "createDocument", {})).rejects.toThrow("URL");
});
