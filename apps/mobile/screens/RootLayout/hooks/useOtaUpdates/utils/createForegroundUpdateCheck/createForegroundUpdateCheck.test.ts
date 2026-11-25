import { describe, expect, test } from "bun:test";
import { createForegroundUpdateCheck } from "./createForegroundUpdateCheck";

function setup() {
	let time = 0;
	let downloads = 0;
	const onAppState = createForegroundUpdateCheck({
		minIntervalMs: 100,
		now: () => time,
		download: () => {
			downloads += 1;
		},
	});
	return {
		onAppState,
		advance: (ms: number) => {
			time += ms;
		},
		downloads: () => downloads,
	};
}

describe("createForegroundUpdateCheck", () => {
	test("does not check on a return that follows the launch check closely", () => {
		const { onAppState, advance, downloads } = setup();
		advance(99);
		onAppState("active");
		expect(downloads()).toBe(0);
	});

	test("checks once per interval however often the app returns", () => {
		const { onAppState, advance, downloads } = setup();
		advance(100);
		onAppState("active");
		onAppState("active");
		advance(99);
		onAppState("active");
		expect(downloads()).toBe(1);
		advance(1);
		onAppState("active");
		expect(downloads()).toBe(2);
	});

	test("only a return to the foreground checks", () => {
		const { onAppState, advance, downloads } = setup();
		advance(1000);
		onAppState("background");
		onAppState("inactive");
		expect(downloads()).toBe(0);
	});
});
