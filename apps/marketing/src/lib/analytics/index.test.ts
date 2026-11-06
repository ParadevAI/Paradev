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
});
