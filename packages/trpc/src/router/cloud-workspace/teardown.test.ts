import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import {
	deleteSandboxAndDriveLater,
	TEARDOWN_ATTEMPTS,
	teardownSandbox,
} from "./teardown";
import * as guard from "./teardown-guard";

let calls: string[];
let attached: boolean;
let queued: Array<{ body: unknown; delaySeconds?: number }>;
let live: { sandbox: boolean; drive: boolean };
let stopFails: boolean;
let holder: string;
let driveDeleteFails: boolean;

stub(sandbox, {
	stopSandbox: async (id: string) => {
		if (stopFails) throw new Error("provider down");
		calls.push(`stop:${id}`);
		return { sessionId: null };
	},
	waitForDriveDetached: async (
		name: string,
		options: { heldByCaller?: (attachedTo: string) => Promise<boolean> } = {},
	) => {
		calls.push(`wait:${name}`);
		if (!attached) return "detached";
		if (await options.heldByCaller?.(holder)) return "held";
		throw new sandbox.DriveStillAttachedError(name, holder);
	},
	deleteSandbox: async (id: string) => {
		calls.push(`delete:${id}`);
	},
	deleteWorkspaceDrive: async (name: string | null) => {
		if (driveDeleteFails) throw new Error("drive delete refused");
		if (name) calls.push(`delete-drive:${name}`);
	},
});
stub(guard, { liveReferences: async () => live });
stub(jobs, {
	publishCloudWorkspaceJob: async (args: {
		body: unknown;
		delaySeconds?: number;
	}) => {
		queued.push({ body: args.body, delaySeconds: args.delaySeconds });
	},
});

beforeEach(() => {
	calls = [];
	attached = false;
	queued = [];
	live = { sandbox: false, drive: false };
	stopFails = false;
	holder = "box";
	driveDeleteFails = false;
});

describe("teardownSandbox", () => {
	test("stops the box, waits for its drive, then deletes the box and the drive", async () => {
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: 0,
			}),
		).toBe("deleted");
		expect(calls).toEqual([
			"stop:box",
			"wait:drive-box",
			"delete:box",
			"delete-drive:drive-box",
		]);
	});

	test("a drive still attached requeues the job and deletes nothing", async () => {
		attached = true;
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: 3,
			}),
		).toBe("retrying");
		expect(calls).toEqual(["stop:box", "wait:drive-box"]);
		expect(queued).toEqual([
			{
				body: { providerSandboxId: "box", driveName: "drive-box", attempt: 4 },
				delaySeconds: 30,
			},
		]);
	});

	test("a box a revived workspace runs on is left alone", async () => {
		live = { sandbox: true, drive: true };
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: 0,
			}),
		).toBe("kept");
		expect(calls).toEqual([]);
	});

	test("an unarchived workspace's new box keeps the drive; only the old box goes", async () => {
		live = { sandbox: false, drive: true };
		expect(
			await teardownSandbox({
				providerSandboxId: "old-box",
				driveName: "drive-box",
				attempt: 0,
			}),
		).toBe("kept");
		expect(calls).toEqual(["stop:old-box", "wait:drive-box", "delete:old-box"]);
	});

	test("a box of the row's lost provision goes; the drive the row runs on is never deleted, failed or not", async () => {
		// The row has since gone failed, and still names the drive with the user's work on it.
		live = { sandbox: false, drive: false };
		expect(
			await teardownSandbox({
				providerSandboxId: "lost-box",
				driveName: "drive-box",
				attempt: 0,
				keepDrive: true,
			}),
		).toBe("deleted");
		expect(calls).toEqual([
			"stop:lost-box",
			"wait:drive-box",
			"delete:lost-box",
		]);
	});

	test("a lost box goes even while the row's live box holds the kept drive", async () => {
		attached = true;
		holder = "live-box";
		expect(
			await teardownSandbox({
				providerSandboxId: "lost-box",
				driveName: "drive-box",
				attempt: 0,
				keepDrive: true,
			}),
		).toBe("deleted");
		expect(calls).toEqual([
			"stop:lost-box",
			"wait:drive-box",
			"delete:lost-box",
		]);
		expect(queued).toEqual([]);
	});

	test("any other failure is retried, not dropped", async () => {
		stopFails = true;
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: 0,
			}),
		).toBe("retrying");
		expect(queued).toHaveLength(1);
	});

	test("a drive a golden environment or another row names is never deleted", async () => {
		live = { sandbox: false, drive: true };
		await teardownSandbox({
			providerSandboxId: "box",
			driveName: "drive-golden",
			attempt: 0,
		});
		expect(calls).not.toContain("delete-drive:drive-golden");
	});

	test("a drive delete that fails is retried", async () => {
		driveDeleteFails = true;
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: 0,
			}),
		).toBe("retrying");
		expect(queued).toEqual([
			{
				body: { providerSandboxId: "box", driveName: "drive-box", attempt: 1 },
				delaySeconds: 30,
			},
		]);
	});

	test("a box without a drive is stopped and deleted, with no drive to wait for", async () => {
		expect(
			await teardownSandbox({
				providerSandboxId: "plain",
				driveName: null,
				attempt: 0,
			}),
		).toBe("deleted");
		expect(calls).toEqual(["stop:plain", "delete:plain"]);
	});

	test("a box without a drive that a row names again is left alone", async () => {
		live = { sandbox: true, drive: false };
		expect(
			await teardownSandbox({
				providerSandboxId: "plain",
				driveName: null,
				attempt: 0,
			}),
		).toBe("kept");
		expect(calls).toEqual([]);
	});

	test("a box without a drive whose delete fails is retried", async () => {
		stopFails = true;
		expect(
			await teardownSandbox({
				providerSandboxId: "plain",
				driveName: null,
				attempt: 0,
			}),
		).toBe("retrying");
		expect(queued.map((job) => job.body)).toEqual([
			{ providerSandboxId: "plain", driveName: null, attempt: 1 },
		]);
	});

	test("gives up after the last attempt instead of requeuing forever", async () => {
		attached = true;
		expect(
			await teardownSandbox({
				providerSandboxId: "box",
				driveName: "drive-box",
				attempt: TEARDOWN_ATTEMPTS - 1,
			}),
		).toBe("abandoned");
		expect(queued).toEqual([]);
	});
});

describe("deleteSandboxAndDriveLater", () => {
	test("every box goes to the retried job, with a drive or without; nothing is deleted inline", async () => {
		await deleteSandboxAndDriveLater({
			providerSandboxId: "plain",
			driveName: null,
		});
		await deleteSandboxAndDriveLater({
			providerSandboxId: "box",
			driveName: "drive-box",
		});
		await deleteSandboxAndDriveLater({
			providerSandboxId: "lost-box",
			driveName: undefined,
			keepDrive: true,
		});
		expect(calls).toEqual([]);
		expect(queued.map((job) => job.body)).toEqual([
			{ providerSandboxId: "plain", driveName: null, attempt: 0 },
			{ providerSandboxId: "box", driveName: "drive-box", attempt: 0 },
			{
				providerSandboxId: "lost-box",
				driveName: null,
				attempt: 0,
				keepDrive: true,
			},
		]);
	});
});
