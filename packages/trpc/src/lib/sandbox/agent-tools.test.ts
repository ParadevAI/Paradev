import { describe, expect, test } from "bun:test";
import { agentToolsDriveFor, organizationFlagEnabled } from "./agent-tools";

const BUNDLE = "0123456789abcdef".repeat(4);
const ORG = "6f1c2b8e-1d2a-4c55-9a3e-0b7f5d2c9e11";

function flags(answer: () => Promise<boolean | undefined>) {
	const asked: unknown[][] = [];
	return {
		asked,
		isFeatureEnabled: (...args: unknown[]) => {
			asked.push(args);
			return answer();
		},
	};
}

describe("organizationFlagEnabled", () => {
	test("asks the flag for the organization and its group", async () => {
		const posthog = flags(() => Promise.resolve(true));
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
			() => Promise.resolve(false),
			() => Promise.resolve(undefined),
			() => Promise.reject(new Error("offline")),
		]) {
			expect(
				await organizationFlagEnabled(flags(answer), "some-flag", ORG),
			).toBe(false);
		}
	});
});

describe("agentToolsDriveFor", () => {
	test("names the bundle's drive in the box's region when the org's flag is on", async () => {
		const posthog = flags(() => Promise.resolve(true));
		expect(
			await agentToolsDriveFor({
				flags: posthog,
				organizationId: ORG,
				region: "sfo1",
				bundleSha: BUNDLE,
			}),
		).toBe("agent-tools-sfo1-0123456789ab");
		expect(posthog.asked[0]?.[0]).toBe("sandbox-agent-tools-drive");
	});

	test("is null while the flag is off", async () => {
		expect(
			await agentToolsDriveFor({
				flags: flags(() => Promise.resolve(false)),
				organizationId: ORG,
				region: "sfo1",
				bundleSha: BUNDLE,
			}),
		).toBeNull();
	});
});
