import { describe, expect, test } from "bun:test";
import { launchEffort } from "./launchEffort";

describe("launchEffort", () => {
	test("a chat launch carries the picked effort to a host that applies it", () => {
		expect(
			launchEffort("high", {
				openAsChat: true,
				hostLaunchesChatWithEffort: true,
			}),
		).toBe("high");
	});

	test("a chat launch drops the effort for an older host, which would open a terminal", () => {
		expect(
			launchEffort("high", {
				openAsChat: true,
				hostLaunchesChatWithEffort: false,
			}),
		).toBeUndefined();
	});

	test("a terminal launch always carries the effort", () => {
		expect(
			launchEffort("max", {
				openAsChat: false,
				hostLaunchesChatWithEffort: false,
			}),
		).toBe("max");
	});

	test("no pick sends no effort", () => {
		expect(
			launchEffort(null, {
				openAsChat: true,
				hostLaunchesChatWithEffort: true,
			}),
		).toBeUndefined();
	});
});
