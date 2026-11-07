import { expect, test } from "bun:test";
import { guardExtensionContents } from "./extension-window";

type OpenHandler = (
	details: Pick<Electron.HandlerDetails, "url" | "disposition">,
) => Electron.WindowOpenHandlerResponse;

function fakeContents() {
	const contents = {
		openHandler: null as OpenHandler | null,
		listeners: new Map<string, (...args: unknown[]) => void>(),
		on(name: string, listener: (...args: unknown[]) => void) {
			contents.listeners.set(name, listener);
		},
		setWindowOpenHandler(handler: OpenHandler) {
			contents.openHandler = handler;
		},
	};
	return contents;
}

test("a sign-in popup from an extension window stays a popup; a plain link opens a tab", () => {
	const contents = fakeContents();
	const opened: string[] = [];
	guardExtensionContents(contents as unknown as Electron.WebContents, (url) =>
		opened.push(url),
	);
	const open = (
		url: string,
		disposition: Electron.HandlerDetails["disposition"],
	) => contents.openHandler?.({ url, disposition }).action;

	expect(
		open(
			"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=x&redirect_uri=https://app.test/cb",
			"foreground-tab",
		),
	).toBe("allow");
	expect(open("https://example.com/help", "foreground-tab")).toBe("deny");
	expect(opened).toEqual(["https://example.com/help"]);
	expect(open("file:///etc/passwd", "new-window")).toBe("deny");

	const child = fakeContents();
	contents.listeners.get("did-create-window")?.({ webContents: child });
	expect(child.openHandler).not.toBeNull();
});
