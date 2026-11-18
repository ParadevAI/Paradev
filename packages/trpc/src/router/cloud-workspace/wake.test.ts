import { describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import {
	type ControlRecord,
	type ControlScope,
	controlLog,
} from "../../lib/control-log";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as meter from "./meter";
import * as sandboxSleep from "./sandbox-sleep";
import * as transition from "./transition";
import { markSandboxUnavailable, restartCloudWorkspace } from "./wake";

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

describe("markSandboxUnavailable", () => {
	const records: ControlRecord[] = [];
	const captured: Array<[unknown, ControlScope, unknown]> = [];
	stub(transition, { transitionCloudWorkspace: async () => true });
	stub(realtime, { nudge: () => {} });
	stub(controlLog, {
		sink: (record: ControlRecord) => {
			records.push(record);
		},
		capture: (error: unknown, scope: ControlScope, extra: unknown) => {
			captured.push([error, scope, extra]);
		},
	});

	test("logs the failure and captures it with the ids as tags", async () => {
		const error = new sandbox.SandboxUnavailableError(
			"ws-box",
			new Error("gone"),
		);
		await markSandboxUnavailable(
			{ id: "ws_1", organizationId: "org_1" } as Parameters<
				typeof markSandboxUnavailable
			>[0],
			error,
		);
		expect(records.map((r) => [r.level, r.body, r.attributes])).toEqual([
			[
				"error",
				"workspace.failed",
				{
					"log.source": "control",
					"cloud_workspace.id": "ws_1",
					"organization.id": "org_1",
					"failure.site": "sandbox_unavailable",
					"error.class": "SandboxUnavailableError",
					"status.changed": true,
				},
			],
		]);
		expect(captured).toEqual([
			[
				error,
				{ cloudWorkspaceId: "ws_1", organizationId: "org_1" },
				{ failureSite: "sandbox_unavailable" },
			],
		]);
	});
});
