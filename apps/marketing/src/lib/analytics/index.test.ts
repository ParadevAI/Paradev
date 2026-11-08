import { afterEach, describe, expect, mock, test } from "bun:test";
import { track } from "./index";

const globalWithWindow = globalThis as { window?: unknown };

afterEach(() => {
	delete globalWithWindow.window;
});

describe("track", () => {
	test("sends a download click to the Reddit Pixel as a Lead", () => {
		const rdt = mock();
		globalWithWindow.window = { rdt };

		track("download_clicked", { source: "compare", slug: "cursor" });

		expect(rdt).toHaveBeenCalledTimes(1);
		const [command, event, properties] = rdt.mock.calls[0] ?? [];
		expect(command).toBe("track");
		expect(event).toBe("Lead");
		expect(properties).toMatchObject({ source: "compare", slug: "cursor" });
	});

	test("does not send a download click to Reddit after the visitor declines analytics", () => {
		const rdt = mock();
		globalWithWindow.window = {
			rdt,
			localStorage: { getItem: () => "declined" },
		};

		track("download_clicked", { source: "compare" });

		expect(rdt).not.toHaveBeenCalled();
	});

	test("does not send other CTA events to the Reddit Pixel", () => {
		const rdt = mock();
		globalWithWindow.window = { rdt };

		track("github_clicked", { source: "hero" });

		expect(rdt).not.toHaveBeenCalled();
	});

	test("sends a download click to Google Ads as a conversion", () => {
		const gtag = mock();
		globalWithWindow.window = { gtag };

		track("download_clicked", { source: "conductor" });

		expect(gtag).toHaveBeenCalledTimes(1);
		const [command, action, params] = gtag.mock.calls[0] ?? [];
		expect(command).toBe("event");
		expect(action).toBe("conversion");
		expect(params).toMatchObject({
			send_to: "AW-18209336001/XAEwCNPrxrQdEMHV8epD",
		});
	});

	test("does not send a download click to Google Ads after the visitor declines analytics", () => {
		const gtag = mock();
		globalWithWindow.window = {
			gtag,
			localStorage: { getItem: () => "declined" },
		};

		track("download_clicked", { source: "conductor" });

		expect(gtag).not.toHaveBeenCalled();
	});

	test("does not send other CTA events to Google Ads", () => {
		const gtag = mock();
		globalWithWindow.window = { gtag };

		track("github_clicked", { source: "hero" });

		expect(gtag).not.toHaveBeenCalled();
	});
	test("does not send ad pixels when the consent choice can't be read", () => {
		const gtag = mock();
		const rdt = mock();
		const warn = console.warn;
		console.warn = () => {};
		globalWithWindow.window = {
			gtag,
			rdt,
			localStorage: {
				getItem: () => {
					throw new Error("storage blocked");
				},
			},
		};

		try {
			track("download_clicked", { source: "conductor" });
		} finally {
			console.warn = warn;
		}

		expect(gtag).not.toHaveBeenCalled();
		expect(rdt).not.toHaveBeenCalled();
	});

	test("ignores events named after built-in object properties", () => {
		const gtag = mock();
		const rdt = mock();
		globalWithWindow.window = { gtag, rdt };

		track("toString");

		expect(gtag).not.toHaveBeenCalled();
		expect(rdt).not.toHaveBeenCalled();
	});
});
