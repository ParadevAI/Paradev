import { describe, expect, test } from "bun:test";
import { CHAT_LAUNCH_EFFORT_MIN_HOST_VERSION } from "@superset/shared/host-version";
import { hostAppliesChatEffort } from "./hostAppliesChatEffort";

describe("hostAppliesChatEffort", () => {
	test("a host on this app's build applies it, even before the release that sets the floor", () => {
		expect(hostAppliesChatEffort("2.0.8", "2.0.8")).toBe(true);
	});

	test("an older adopted host below the floor does not", () => {
		expect(hostAppliesChatEffort("2.0.7", "2.0.9")).toBe(false);
	});

	test("a host at the floor does, whatever this app's version", () => {
		expect(
			hostAppliesChatEffort(CHAT_LAUNCH_EFFORT_MIN_HOST_VERSION, "2.1.0"),
		).toBe(true);
	});

	test("an unknown host version does not", () => {
		expect(hostAppliesChatEffort(undefined, "2.0.9")).toBe(false);
	});
});
