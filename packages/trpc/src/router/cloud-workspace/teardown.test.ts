import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import {
	deleteSandboxAndDriveLater,
	TEARDOWN_ATTEMPTS,
	teardownSandbox,
} from "./teardown";

let calls: string[];
let attached: boolean;
let queued: Array<{ body: unknown; delaySeconds?: number }>;

stub(sandbox, {
	stopSandbox: async (id: string) => {
		calls.push(`stop:${id}`);
		return { sessionId: null };
	},
	waitForDriveDetached: async (name: string) => {
		calls.push(`wait:${name}`);
		if (attached) throw new sandbox.DriveStillAttachedError(name, "box");
		return "detached";
	},
	deleteSandbox: async (id: string) => {
		calls.push(`delete:${id}`);
	},
	deleteWorkspaceDrive: async (name: string | null) => {
		if (name) calls.push(`delete-drive:${name}`);
	},
});
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
	test("a box without a drive is deleted now; one with a drive goes to the job", async () => {
		await deleteSandboxAndDriveLater({
			providerSandboxId: "plain",
			driveName: null,
		});
		await deleteSandboxAndDriveLater({
			providerSandboxId: "box",
			driveName: "drive-box",
		});
		expect(calls).toEqual(["delete:plain"]);
		expect(queued).toEqual([
			{
				body: { providerSandboxId: "box", driveName: "drive-box", attempt: 0 },
				delaySeconds: undefined,
			},
		]);
	});
});
