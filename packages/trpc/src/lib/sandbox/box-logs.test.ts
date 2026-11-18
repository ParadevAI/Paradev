import { describe, expect, test } from "bun:test";
import { boxLogsEnabled } from "./box-logs";

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

describe("boxLogsEnabled", () => {
	test("is on only when the fleet switch and the organization's flag are both on", async () => {
		const posthog = flags({
			"sandbox-box-logs-fleet": on,
			"sandbox-box-logs": on,
		});
		expect(await boxLogsEnabled(posthog, ORG)).toBe(true);
		expect(posthog.asked.map((a) => a.slice(0, 2))).toEqual([
			["sandbox-box-logs-fleet", "sandbox-fleet"],
			["sandbox-box-logs", ORG],
		]);
		expect(posthog.asked[1]?.[2]).toMatchObject({
			groups: { organization: ORG },
		});
	});

	test("does not ask the organization's flag while the fleet switch is off", async () => {
		const posthog = flags({
			"sandbox-box-logs-fleet": () => Promise.resolve(false),
			"sandbox-box-logs": on,
		});
		expect(await boxLogsEnabled(posthog, ORG)).toBe(false);
		expect(posthog.asked).toHaveLength(1);
	});

	test("fails closed when either switch is off, unloaded or PostHog is down", async () => {
		for (const off of [
			() => Promise.resolve(false),
			() => Promise.resolve(undefined),
			() => Promise.reject(new Error("offline")),
		]) {
			expect(
				await boxLogsEnabled(
					flags({ "sandbox-box-logs-fleet": on, "sandbox-box-logs": off }),
					ORG,
				),
			).toBe(false);
			expect(
				await boxLogsEnabled(
					flags({ "sandbox-box-logs-fleet": off, "sandbox-box-logs": on }),
					ORG,
				),
			).toBe(false);
		}
	});
});
