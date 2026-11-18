import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import { posthog } from "../analytics";
import { agentToolsDriveEnabled } from "./agent-tools";

let answer: () => Promise<boolean | undefined> = () => Promise.resolve(true);
const asked: unknown[][] = [];
stub(posthog, {
	isFeatureEnabled: (...args: unknown[]) => {
		asked.push(args);
		return answer();
	},
});

const ORG = "6f1c2b8e-1d2a-4c55-9a3e-0b7f5d2c9e11";

describe("agentToolsDriveEnabled", () => {
	test("asks the org's flag", async () => {
		answer = () => Promise.resolve(true);
		expect(await agentToolsDriveEnabled(ORG)).toBe(true);
		expect(asked.at(-1)?.[0]).toBe("sandbox-agent-tools-drive");
		expect(asked.at(-1)?.[2]).toMatchObject({
			groups: { organization: ORG },
		});
	});

	test("fails closed when the flag is off, unloaded or PostHog is down", async () => {
		for (const next of [
			() => Promise.resolve(false),
			() => Promise.resolve(undefined),
			() => Promise.reject(new Error("offline")),
		]) {
			answer = next;
			expect(await agentToolsDriveEnabled(ORG)).toBe(false);
		}
	});
});
