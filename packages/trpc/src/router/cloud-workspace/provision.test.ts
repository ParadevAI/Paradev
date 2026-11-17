import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as laidOut from "./drive-laid-out";
import * as meter from "./meter";
import { provisionCloudWorkspace } from "./provision";
import * as expiry from "./sandbox-expiry";
import * as sleep from "./sandbox-sleep";
import * as teardown from "./teardown";
import * as transition from "./transition";

const ROW = {
	id: "00000000-0000-4000-8000-000000000001",
	organizationId: "00000000-0000-4000-8000-000000000002",
	createdByUserId: null,
	status: "provisioning",
	providerSandboxId: "ws-box",
	driveName: null as string | null,
	driveLaidOutAt: null as Date | null,
};

let row: typeof ROW;
let events: string[];
let settle: () => Promise<unknown>;
let create: () => Promise<unknown>;
let fork: "existing" | "forked";
let wins: (to: string) => boolean;
let current: { status: string } | undefined;

let reads = 0;
stub(db.query.cloudWorkspaces, {
	findFirst: async () => (reads++ === 0 ? row : current),
});
stub(db, {
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: async () => {
				events.push(`update ${Object.keys(values).join(",")}`);
			},
		}),
	}),
});
stub(sandbox, {
	buildSandboxClaim: async () => ({
		claim: { vcpus: 4 },
		environment: { region: "iad1", goldenDriveName: "env-drive-g" },
		agentCredentialDigest: "d",
		driveName: "drive-ws-box",
	}),
	forkWorkspaceDrive: async () => fork,
	provisionSandbox: async () => {
		await create();
		return {
			providerSandboxId: "ws-box",
			sandboxUrl: "https://box.invalid",
			hostTarget: "https://box.invalid",
			expiresAt: null,
			sessionId: "session-1",
			bootId: "boot-1",
		};
	},
	settleSandbox: async () => settle(),
	stopSandbox: async () => {
		events.push("stop");
		return { sessionId: "session-1" };
	},
	recordBootSpans: () => {},
});
stub(meter, {
	authorizeBoot: async () => ({ bootId: null }),
	attachBootSession: async () => {},
	releaseBoot: async () => {},
});
stub(transition, {
	transitionCloudWorkspace: async (args: {
		to: string;
		set?: Record<string, unknown>;
	}) => {
		if (!wins(args.to)) return false;
		events.push(
			`to ${args.to}${args.set && "providerSandboxId" in args.set ? ` box=${args.set.providerSandboxId === "ws-box" ? "same" : "new"}` : ""}`,
		);
		return true;
	},
});
stub(sleep, {
	recordSandboxAsleep: async () => {
		events.push("asleep");
	},
});
stub(expiry, { recordSandboxAwake: async () => {} });
stub(laidOut, {
	recordDriveLaidOut: async () => {
		events.push("laid out");
	},
});
stub(teardown, {
	deleteSandboxAndDriveLater: async (args: { driveName: string | null }) => {
		events.push(`teardown drive=${args.driveName}`);
	},
});
stub(chatMoves, {
	queueChatMovesTo: async () => {},
	failChatMovesTo: async () => {},
});
stub(realtime, { nudge: () => {} });

beforeEach(() => {
	row = { ...ROW };
	events = [];
	settle = async () => ({ stamps: [], answeredAt: 0 });
	create = async () => {};
	fork = "forked";
	wins = () => true;
	current = undefined;
	reads = 0;
});

describe("provisionCloudWorkspace with a drive", () => {
	test("records the drive laid out once the boot answered", async () => {
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"provisioned",
		);
		expect(events).toContain("laid out");
	});

	test("a drive refusal at create leaves the workspace asleep for the next wake, never failed", async () => {
		settle = async () => {
			throw new sandbox.SandboxDriveMissingError(
				"ws-box",
				"drive-ws-box",
				"drive.missing",
			);
		};
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"provisioned",
		);
		expect(events).toContain("stop");
		expect(events).toContain("asleep");
		expect(events).not.toContain("to failed");
		expect(events.some((event) => event.startsWith("teardown"))).toBe(false);
	});

	test("a provision that lost its row to an archive leaves the box to that archive's reap", async () => {
		wins = (to) => to !== "awake";
		current = { status: "archived" };
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"skipped",
		);
		expect(events.some((event) => event.startsWith("teardown"))).toBe(false);
		expect(events).not.toContain("stop");
	});

	test("a failed create retires the box's name in the same write that fails the row, then tears it down", async () => {
		create = async () => {
			throw new Error("create refused");
		};
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(events).toEqual([
			"update driveName",
			"to failed box=new",
			"teardown drive=drive-ws-box",
		]);
	});

	test("a failed create whose row was archived meanwhile tears nothing down", async () => {
		create = async () => {
			throw new Error("create refused");
		};
		wins = (to) => to !== "failed";
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(events.some((event) => event.startsWith("teardown"))).toBe(false);
	});

	test("a failed create deletes a drive it forked, never one it found", async () => {
		create = async () => {
			throw new Error("create refused");
		};
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(events).toContain("teardown drive=drive-ws-box");

		events = [];
		reads = 0;
		row = { ...ROW, driveName: "drive-ws-box" };
		fork = "existing";
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(events).toContain("teardown drive=null");
		expect(events).toContain("to failed box=new");
	});
});
