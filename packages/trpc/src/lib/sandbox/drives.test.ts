import { beforeEach, describe, expect, test } from "bun:test";
import { APIError, Drive } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	deleteWorkspaceDrive,
	ensureWorkspaceDrive,
	WORKSPACE_DRIVE_MOUNT_PATH,
	workspaceDriveMounts,
} from "./drives";

interface FakeDrive {
	name: string;
	region: string;
	fork: (params: { name: string }) => Promise<FakeDrive>;
	delete: () => Promise<void>;
}

let drives: Map<string, FakeDrive>;
let calls: string[];

function fakeDrive(name: string, region: string): FakeDrive {
	return {
		name,
		region,
		fork: async (params) => {
			calls.push(`fork:${name}->${params.name}`);
			const forked = fakeDrive(params.name, region);
			drives.set(params.name, forked);
			return forked;
		},
		delete: async () => {
			calls.push(`delete:${name}`);
			drives.delete(name);
		},
	};
}

stub(Drive, {
	get: async ({ name }: { name: string }) => {
		const drive = drives.get(name);
		if (!drive) throw new APIError(new Response(null, { status: 404 }));
		return drive;
	},
	getOrCreate: async ({ name, region }: { name: string; region: string }) => {
		calls.push(`create:${name}@${region}`);
		const drive = fakeDrive(name, region);
		drives.set(name, drive);
		return drive;
	},
});

beforeEach(() => {
	drives = new Map();
	calls = [];
});

describe("workspaceDriveMounts", () => {
	test("mounts the drive read-write at one path", () => {
		expect(workspaceDriveMounts("drive-ws-1")).toEqual({
			[WORKSPACE_DRIVE_MOUNT_PATH]: { drive: "drive-ws-1", mode: "read-write" },
		});
	});

	test("mounts nothing for a workspace without a drive", () => {
		expect(workspaceDriveMounts(null)).toBeUndefined();
		expect(workspaceDriveMounts(undefined)).toBeUndefined();
	});
});

describe("ensureWorkspaceDrive", () => {
	test("forks the golden drive when the environment has one", async () => {
		drives.set("golden", fakeDrive("golden", "iad1"));
		await ensureWorkspaceDrive({
			name: "drive-ws-1",
			region: "iad1",
			goldenDriveName: "golden",
		});
		expect(calls).toEqual(["fork:golden->drive-ws-1"]);
	});

	test("creates an empty drive in the sandbox's region without a golden", async () => {
		await ensureWorkspaceDrive({
			name: "drive-ws-1",
			region: "sfo1",
			goldenDriveName: null,
		});
		expect(calls).toEqual(["create:drive-ws-1@sfo1"]);
	});

	test("finds the drive a previous delivery made", async () => {
		drives.set("golden", fakeDrive("golden", "iad1"));
		drives.set("drive-ws-1", fakeDrive("drive-ws-1", "iad1"));
		await ensureWorkspaceDrive({
			name: "drive-ws-1",
			region: "iad1",
			goldenDriveName: "golden",
		});
		expect(calls).toEqual([]);
	});

	test("refuses a golden in another region", async () => {
		drives.set("golden", fakeDrive("golden", "iad1"));
		await expect(
			ensureWorkspaceDrive({
				name: "drive-ws-1",
				region: "sfo1",
				goldenDriveName: "golden",
			}),
		).rejects.toThrow("is in iad1");
		expect(calls).toEqual([]);
	});
});

describe("deleteWorkspaceDrive", () => {
	test("deletes the drive, and treats one already gone as deleted", async () => {
		drives.set("drive-ws-1", fakeDrive("drive-ws-1", "iad1"));
		await deleteWorkspaceDrive("drive-ws-1");
		await deleteWorkspaceDrive("drive-ws-1");
		await deleteWorkspaceDrive(null);
		expect(calls).toEqual(["delete:drive-ws-1"]);
	});
});
