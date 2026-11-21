import { describe, expect, test } from "bun:test";
import { organizationFlagEnabled } from "./feature-flags";

const ORG = "6f1c2b8e-1d2a-4c55-9a3e-0b7f5d2c9e11";

function flags(answers: Record<string, () => Promise<boolean | undefined>>) {
	const asked: unknown[][] = [];
	return {
		asked,
		isFeatureEnabled: (...args: unknown[]) => {
			asked.push(args);
			return answers[args[0] as string]?.() ?? Promise.resolve(undefined);
		},
	};
}
const on = () => Promise.resolve(true);
const off = () => Promise.resolve(false);

describe("organizationFlagEnabled", () => {
	test("asks the flag for the organization and its group", async () => {
		const posthog = flags({ "some-flag": on });
		expect(await organizationFlagEnabled(posthog, "some-flag", ORG)).toBe(true);
		expect(posthog.asked).toEqual([
			[
				"some-flag",
				ORG,
				{ groups: { organization: ORG }, sendFeatureFlagEvents: false },
			],
		]);
	});

	test("fails closed when the flag is off, unloaded or PostHog is down", async () => {
		for (const answer of [
			off,
			() => Promise.resolve(undefined),
			() => Promise.reject(new Error("offline")),
		]) {
			expect(
				await organizationFlagEnabled(
					flags({ "some-flag": answer }),
					"some-flag",
					ORG,
				),
			).toBe(false);
		}
	});
});
