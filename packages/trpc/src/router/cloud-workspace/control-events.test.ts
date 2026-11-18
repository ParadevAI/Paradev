import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { userError } from "../../i18n-error";
import {
	type ControlRecord,
	type ControlScope,
	controlLog,
} from "../../lib/control-log";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as jobs from "./jobs";
import { provisionCloudWorkspace } from "./provision";
import * as sandboxExpiry from "./sandbox-expiry";
import { queueProvision } from "./start";
import * as transition from "./transition";
import { wakeCloudWorkspace } from "./wake";

const records: ControlRecord[] = [];
const captured: Array<[unknown, ControlScope, unknown]> = [];
const transitions: Array<{ to: string }> = [];

stub(controlLog, {
	sink: (record: ControlRecord) => {
		records.push(record);
	},
	capture: (error: unknown, scope: ControlScope, extra: unknown) => {
		captured.push([error, scope, extra]);
	},
});
stub(transition, {
	transitionCloudWorkspace: async (args: { to: string }) => {
		transitions.push({ to: args.to });
		return true;
	},
});
stub(realtime, { nudge: () => {} });
stub(sandboxExpiry, { recordSandboxAwake: async () => {} });
stub(chatMoves, { failChatMovesTo: async () => {} });
stub(jobs, {
	publishCloudWorkspaceJob: async () => {
		throw new Error("qstash down");
	},
});
stub(db.query.cloudWorkspaces, {
	findFirst: async () => ({
		id: "ws_1",
		organizationId: "org_1",
		status: "provisioning",
		providerSandboxId: "ws-box",
		name: "Cloud workspace",
	}),
});
let claimError: Error | null = new TypeError("claim failed");
let woken = { booted: false, rebooted: false };
stub(sandbox, {
	buildSandboxClaim: async () => {
		if (claimError) throw claimError;
		return { claim: {}, agentCredentialDigest: "digest" };
	},
	wakeSandbox: async () => ({
		hostTarget: "https://box.test",
		...woken,
		answer: { stamps: [] },
		expiresAt: null,
		sessionId: null,
	}),
	deleteSandbox: async () => {},
});

function reset() {
	records.length = 0;
	captured.length = 0;
	transitions.length = 0;
}

const SCOPE = { cloudWorkspaceId: "ws_1", organizationId: "org_1" };

describe("a workspace marked failed is logged and captured", () => {
	test("when its provisioning job cannot be queued", async () => {
		reset();
		await expect(
			queueProvision({ cloudWorkspaceId: "ws_1" }, "org_1"),
		).rejects.toThrow("Could not start cloud workspace provisioning");
		expect(transitions).toEqual([{ to: "failed" }]);
		expect(records.at(-1)).toEqual({
			level: "error",
			body: "workspace.failed",
			attributes: {
				"log.source": "control",
				...{ "cloud_workspace.id": "ws_1", "organization.id": "org_1" },
				"failure.site": "queue",
				"error.class": "Error",
				"status.changed": true,
			},
		});
		expect(captured).toEqual([
			[expect.any(Error), SCOPE, { failureSite: "queue" }],
		]);
	});

	test("when provisioning throws", async () => {
		reset();
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" })).toBe(
			"failed",
		);
		expect(transitions).toEqual([{ to: "failed" }]);
		expect(records.map((r) => r.body)).toEqual([
			"provision.started",
			"workspace.failed",
		]);
		expect(records.at(-1)?.attributes).toMatchObject({
			"failure.site": "provision",
			"error.class": "TypeError",
			"status.changed": true,
			"sandbox.kept": false,
		});
		expect(captured).toEqual([
			[expect.any(TypeError), SCOPE, { failureSite: "provision" }],
		]);
	});

	test("a refused boot is a warning and not an exception", async () => {
		reset();
		claimError = userError({
			code: "FORBIDDEN",
			message: "limit reached",
			i18nKey: "serverError.cloudWorkspace.usageLimitReached",
		});
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: "ws_1" })).toBe(
			"failed",
		);
		claimError = new TypeError("claim failed");
		expect(transitions).toEqual([{ to: "failed" }]);
		const failed = records.at(-1);
		expect(failed?.level).toBe("warn");
		expect(failed?.attributes).toMatchObject({
			"failure.site": "provision",
			"error.class": "TRPCError",
			"failure.refused": true,
		});
		expect(captured).toEqual([]);
	});
});

describe("wake events", () => {
	const row = {
		id: "ws_1",
		organizationId: "org_1",
		providerSandboxId: "ws-box",
		sandboxUrl: "https://box.test",
		bootAgentCredentialDigest: "digest",
	} as Parameters<typeof wakeCloudWorkspace>[0];

	test("a keepalive wake of a serving box writes nothing", async () => {
		reset();
		claimError = null;
		woken = { booted: false, rebooted: false };
		await wakeCloudWorkspace(row);
		expect(records).toEqual([]);
	});

	test("a wake that boots the box again is logged", async () => {
		reset();
		claimError = null;
		woken = { booted: false, rebooted: true };
		await wakeCloudWorkspace(row);
		expect(records.map((r) => [r.body, r.attributes["box.rebooted"]])).toEqual([
			["wake.completed", true],
		]);
		claimError = new TypeError("claim failed");
	});
});
