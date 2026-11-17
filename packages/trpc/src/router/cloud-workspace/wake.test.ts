import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import * as sandboxSleep from "./sandbox-sleep";
import { restartCloudWorkspace, wakeCloudWorkspace } from "./wake";

const recordedAsleep: Array<[string, { sessionId: string | null }]> = [];
const wakes: Array<{ mounts?: unknown }> = [];

stub(sandbox, {
	describeSandbox: async () => ({ running: true }),
	stopAndSnapshot: async () => ({ sessionId: "session_1" }),
	buildSandboxClaim: async () => ({ claim: {}, agentCredentialDigest: "" }),
	wakeSandbox: async (args: { mounts?: unknown }) => {
		wakes.push(args);
		throw new Error("wake not under test");
	},
});
stub(meter, { queueSettleWorkspace: async () => {} });
stub(sandboxSleep, {
	recordSandboxAsleep: async (
		id: string,
		stopped: { sessionId: string | null },
	) => {
		recordedAsleep.push([id, stopped]);
	},
});

describe("restartCloudWorkspace", () => {
	test("records asleep only for the session it stopped, before the wake", async () => {
		await expect(
			restartCloudWorkspace({
				id: "ws_1",
				providerSandboxId: "ws-box",
			} as Parameters<typeof restartCloudWorkspace>[0]),
		).rejects.toThrow("wake not under test");
		expect(recordedAsleep).toEqual([["ws_1", { sessionId: "session_1" }]]);
	});
});

describe("wakeCloudWorkspace", () => {
	test("a workspace without a drive is woken with no mounts, whatever its environment", async () => {
		wakes.length = 0;
		await expect(
			wakeCloudWorkspace({
				id: "ws_2",
				providerSandboxId: "ws-box-2",
				driveName: null,
			} as Parameters<typeof wakeCloudWorkspace>[0]),
		).rejects.toThrow("wake not under test");
		expect(wakes).toHaveLength(1);
		expect(wakes[0]?.mounts).toBeUndefined();
	});
});
