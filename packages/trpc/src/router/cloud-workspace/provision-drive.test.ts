import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as realtime from "../../lib/realtime";
import * as sandbox from "../../lib/sandbox";
import * as chatMoves from "../chat-move/utils/queueChatMove";
import * as laidOut from "./drive-laid-out";
import * as jobs from "./jobs";
import * as meter from "./meter";
import { provisionCloudWorkspace } from "./provision";
import * as resumeLock from "./resume-lock";
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
let current: { status: string; providerSandboxId?: string } | undefined;
let lockKeys: string[];
let rowBox: string;
// The row's status as the transitions see it: another delivery or a wake may have moved it.
let rowStatus: string;
let authorize: () => Promise<{ bootId: string | null }>;
let requeued: unknown[];

let reads = 0;
let claimedDrive: string | null = "drive-ws-box";
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
		driveName: claimedDrive,
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
	authorizeBoot: async () => authorize(),
	attachBootSession: async () => {},
	releaseBoot: async () => {},
});
type Move = {
	from: string[];
	to: string;
	set?: Record<string, unknown>;
	onBox?: string;
};
function move(args: Move): boolean {
	if (!wins(args.to)) return false;
	if (!args.from.includes(rowStatus)) return false;
	if (args.onBox !== undefined && args.onBox !== rowBox) return false;
	events.push(
		`to ${args.to}${args.set && "providerSandboxId" in args.set ? ` box=${args.set.providerSandboxId === "ws-box" ? "same" : "new"}` : ""}`,
	);
	rowStatus = args.to;
	return true;
}
stub(transition, {
	transitionCloudWorkspace: async (args: Move) => move(args),
	failCloudWorkspace: async (args: Omit<Move, "to">) =>
		move({ ...args, to: "failed" }),
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
	deleteSandboxAndDriveLater: async (args: {
		driveName: string | null;
		keepDrive?: boolean;
	}) => {
		events.push(
			`teardown drive=${args.driveName}${args.keepDrive ? " kept" : ""}`,
		);
	},
});
stub(chatMoves, {
	queueChatMovesTo: async () => {},
	failChatMovesTo: async () => {},
});
stub(realtime, { nudge: () => {} });
stub(jobs, {
	publishCloudWorkspaceJob: async (job: { body: unknown }) => {
		requeued.push(job.body);
	},
});
stub(resumeLock, {
	sandboxResumeLock: (key: string) => {
		lockKeys.push(key);
		return (step: () => Promise<unknown>) => step();
	},
});

beforeEach(() => {
	row = { ...ROW };
	events = [];
	settle = async () => ({ stamps: [], answeredAt: 0 });
	create = async () => {};
	fork = "forked";
	wins = () => true;
	current = undefined;
	reads = 0;
	claimedDrive = "drive-ws-box";
	lockKeys = [];
	rowBox = "ws-box";
	rowStatus = "provisioning";
	authorize = async () => ({ bootId: null });
	requeued = [];
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

	test("a second delivery on the same box that fails after the first brought the row up leaves the live workspace alone", async () => {
		// The first delivery made the row awake and the user works; this one is refused by the spend cap.
		rowStatus = "awake";
		authorize = async () => {
			throw new Error("spend cap reached");
		};
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"failed",
		);
		expect(rowStatus).toBe("awake");
		expect(events).not.toContain("stop");
		expect(events.some((event) => event.startsWith("teardown"))).toBe(false);
		expect(events.some((event) => event.startsWith("to "))).toBe(false);
	});

	test("a lock held by another caller requeues the provision; nothing is stopped or failed", async () => {
		create = async () => {
			throw new sandbox.SandboxBusyError("drive-ws-box");
		};
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"retrying",
		);
		expect(requeued).toEqual([{ cloudWorkspaceId: ROW.id, lockRetries: 1 }]);
		expect(events).not.toContain("stop");
		expect(events.some((event) => event.startsWith("to "))).toBe(false);
	});

	test("a lock still held after the last retry fails only a row still provisioning", async () => {
		create = async () => {
			throw new sandbox.SandboxBusyError("drive-ws-box");
		};
		await provisionCloudWorkspace({
			cloudWorkspaceId: ROW.id,
			lockRetries: 10,
		});
		expect(requeued).toEqual([]);
		expect(events).toContain("to failed box=same");
	});

	test("a provision overtaken by an undo's second provision gives up its box, keeps the drive, and never marks the row", async () => {
		// Deleted between claim and create, then undone: the row names another box now.
		rowBox = "ws-box-2";
		current = { status: "provisioning", providerSandboxId: "ws-box-2" };
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"skipped",
		);
		expect(events).toContain("teardown drive=drive-ws-box kept");
		expect(events.some((event) => event.startsWith("to "))).toBe(false);
		expect(events).not.toContain("laid out");
	});

	test("an overtaken provision of a workspace without a drive hands its box to the retried teardown too", async () => {
		claimedDrive = null;
		rowBox = "ws-box-2";
		current = { status: "provisioning", providerSandboxId: "ws-box-2" };
		expect(await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id })).toBe(
			"skipped",
		);
		expect(events).toContain("teardown drive=null kept");
		expect(events).not.toContain("stop");
	});

	test("the create holds the lock of the drive, whatever the box is called", async () => {
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(lockKeys).toEqual(["drive-ws-box"]);
	});

	test("a provision that lost its row to an archive leaves the box to that archive's reap", async () => {
		wins = (to) => to !== "awake";
		current = { status: "archived", providerSandboxId: "ws-box" };
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
		rowStatus = "provisioning";
		row = { ...ROW, driveName: "drive-ws-box" };
		fork = "existing";
		await provisionCloudWorkspace({ cloudWorkspaceId: ROW.id });
		expect(events).toContain("teardown drive=null");
		expect(events).toContain("to failed box=new");
	});
});
