import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import * as sandboxSleep from "./sandbox-sleep";
import { restartCloudWorkspace } from "./wake";

const recordedAsleep: Array<[string, { sessionId: string | null }]> = [];

stub(sandbox, {
	describeSandbox: async () => ({ running: true }),
	stopAndSnapshot: async () => ({ sessionId: "session_1" }),
	buildSandboxClaim: async () => {
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
