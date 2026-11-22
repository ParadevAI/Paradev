import { describe, expect, test } from "bun:test";
import type { PageViewportZoom } from "@superset/shared/page-zoom";
import { attachBrowserViewportZoom } from "./browser-viewport-zoom";

describe("attachBrowserViewportZoom", () => {
	test("applies each viewport for its pane and stops on detach", () => {
		let onData = (_viewport: PageViewportZoom) => {};
		let subscribedPane = "";
		let unsubscribed = false;
		const webview = {
			offsetWidth: 100,
			offsetHeight: 100,
			style: { transform: "", transformOrigin: "", clipPath: "" },
		};
		const detach = attachBrowserViewportZoom(webview as never, "pane-1", {
			subscribe: (input, handlers) => {
				subscribedPane = input.paneId;
				onData = handlers.onData;
				return { unsubscribe: () => (unsubscribed = true) };
			},
		});
		onData({ scale: 2, x: 0, y: 0, width: 100, height: 100 });
		expect(subscribedPane).toBe("pane-1");
		expect(webview.style.transform).toContain("scale(2)");
		detach();
		expect(unsubscribed).toBe(true);
	});
});
