import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import { posthog } from "../analytics";
import { BOX_LOGS_FLEET_SUBJECT, boxLogsIdentity } from "./box-logs";

const ORG = "6f1c2b8e-1d2a-4c55-9a3e-0b7f5d2c9e11";
let answers: Record<string, () => Promise<boolean | undefined>> = {};
const asked: unknown[][] = [];
stub(posthog, {
	isFeatureEnabled: (...args: unknown[]) => {
		asked.push(args);
		return answers[args[0] as string]?.() ?? Promise.resolve(undefined);
	},
});

const on = () => Promise.resolve(true);

describe("boxLogsIdentity", () => {
	test("turns the shipper on only when the fleet switch and the organization's flag are both on", async () => {
		answers = { "sandbox-box-logs-fleet": on, "sandbox-box-logs": on };
		asked.length = 0;
		expect(await boxLogsIdentity(ORG)).toEqual({
			SUPERSET_SANDBOX_BOX_LOGS: "1",
		});
		const fleet = asked.find((a) => a[0] === "sandbox-box-logs-fleet");
		const org = asked.find((a) => a[0] === "sandbox-box-logs");
		expect(fleet?.[1]).toBe(BOX_LOGS_FLEET_SUBJECT);
		expect(org?.[1]).toBe(ORG);
		expect(org?.[2]).toMatchObject({ groups: { organization: ORG } });
	});

	test("fails closed when either switch is off, unloaded or PostHog is down", async () => {
		const off = [
			() => Promise.resolve(false),
			() => Promise.resolve(undefined),
			() => Promise.reject(new Error("offline")),
		];
		for (const next of off) {
			answers = { "sandbox-box-logs-fleet": on, "sandbox-box-logs": next };
			expect(await boxLogsIdentity(ORG)).toEqual({});
			answers = { "sandbox-box-logs-fleet": next, "sandbox-box-logs": on };
			expect(await boxLogsIdentity(ORG)).toEqual({});
		}
	});
});
