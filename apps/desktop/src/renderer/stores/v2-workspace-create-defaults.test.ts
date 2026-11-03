import { describe, expect, test } from "bun:test";
import {
	type CloudCreateChoice,
	MAX_CLOUD_CHOICES,
	rememberCloudChoice,
} from "./v2-workspace-create-defaults";

describe("rememberCloudChoice", () => {
	test("merges into the project's entry and bumps it", () => {
		const choices = rememberCloudChoice(
			{ a: { environmentId: "env-1", machineSize: "small", usedAt: 1 } },
			"a",
			{ machineSize: "large" },
			5,
		);
		expect(choices.a).toEqual({
			environmentId: "env-1",
			machineSize: "large",
			usedAt: 5,
		});
	});

	test("evicts the least recently used past the cap", () => {
		let choices: Record<string, CloudCreateChoice> = {};
		for (let i = 0; i <= MAX_CLOUD_CHOICES; i++) {
			choices = rememberCloudChoice(
				choices,
				`p${i}`,
				{ environmentId: "e" },
				i,
			);
		}
		expect(Object.keys(choices)).toHaveLength(MAX_CLOUD_CHOICES);
		expect(choices.p0).toBeUndefined();
		expect(choices[`p${MAX_CLOUD_CHOICES}`]).toBeDefined();
	});
});
