import { describe, expect, test } from "bun:test";
import { attachBrowserViewportZoom } from "./browser-viewport-zoom";

function fakeWebview(results: unknown[]) {
	const queue = [...results];
	let onReady: (() => void) | null = null;
	const webview = {
		calls: 0,
		offsetWidth: 100,
		offsetHeight: 100,
		style: { transform: "", transformOrigin: "", clipPath: "" },
		addEventListener: (_: string, fn: () => void) => {
			onReady = fn;
		},
		removeEventListener: () => {},
		executeJavaScript: () => {
			webview.calls++;
			return queue.length
				? Promise.resolve(queue.shift())
				: new Promise<never>(() => {});
		},
		ready: () => onReady?.(),
	};
	return webview;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const viewport = { scale: 2, x: 0, y: 0, width: 100, height: 100 };

describe("attachBrowserViewportZoom", () => {
	test("applies each reported viewport and waits for the next", async () => {
		const webview = fakeWebview([viewport]);
		attachBrowserViewportZoom(webview as never);
		webview.ready();
		await settle();
		expect(webview.style.transform).toContain("scale(2)");
		expect(webview.calls).toBe(2);
	});

	test("stops on a non-viewport result instead of spinning (Zone.js promise)", async () => {
		const zonePromise = {
			__zone_symbol__state: null,
			__zone_symbol__value: [],
		};
		const webview = fakeWebview([zonePromise, zonePromise, zonePromise]);
		attachBrowserViewportZoom(webview as never);
		webview.ready();
		await settle();
		expect(webview.calls).toBe(1);
		expect(webview.style.transform).toBe("");
	});
});
