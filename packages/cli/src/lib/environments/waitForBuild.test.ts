import { describe, expect, test } from "bun:test";
import { type BuildStatus, waitForBuild } from "./waitForBuild";

describe("waitForBuild", () => {
	test("returns the build once it finishes", async () => {
		const states: BuildStatus["status"][] = ["running", "running", "failed"];
		const build = await waitForBuild({
			buildId: "b1",
			fetchBuilds: async () => [
				{ id: "b1", status: states.shift() ?? "failed", error: "boom" },
			],
			sleep: async () => {},
		});
		expect(build).toEqual({ id: "b1", status: "failed", error: "boom" });
	});

	test("gives up after the timeout", async () => {
		let clock = 0;
		const build = await waitForBuild({
			buildId: "b1",
			fetchBuilds: async () => [{ id: "b1", status: "running", error: null }],
			intervalMs: 10,
			timeoutMs: 25,
			sleep: async (ms) => {
				clock += ms;
			},
			now: () => clock,
		});
		expect(build).toBeNull();
	});
});
