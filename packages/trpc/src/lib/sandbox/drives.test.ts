import { beforeEach, describe, expect, test } from "bun:test";
import { renderSandboxConf } from "@superset/shared/sandbox/contract";
import {
	type DriveHost,
	DriveStillAttachedError,
	deleteWorkspaceDrive,
	forkWorkspaceDrive,
	WORKSPACE_DRIVE_MOUNT_PATH,
	waitForDriveDetached,
	workspaceDriveIdentity,
	workspaceDriveMounts,
	workspaceDriveNameToClaim,
} from "./drives";

let drives: Map<string, { region: string; attachedTo?: string }>;
let calls: string[];

const host: DriveHost = {
	find: async (name) => drives.get(name) ?? null,
	create: async (name, region) => {
		calls.push(`create:${name}@${region}`);
		drives.set(name, { region });
	},
	fork: async (source, name) => {
		calls.push(`fork:${source}->${name}`);
		const parent = drives.get(source);
		if (!parent) throw new Error(`no ${source}`);
		drives.set(name, { region: parent.region });
	},
	remove: async (name) => {
		if (drives.get(name)?.attachedTo) throw new Error(`${name} attached`);
		if (drives.delete(name)) calls.push(`delete:${name}`);
	},
};

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

describe("workspaceDriveIdentity", () => {
	const identity = {
		SUPERSET_SANDBOX_CONTRACT: "1",
		SUPERSET_BUNDLE_SHA: "a".repeat(64),
		SUPERSET_API_URL: "https://api.example.invalid",
		SUPERSET_SANDBOX_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
		SUPERSET_SANDBOX_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000002",
		SUPERSET_SANDBOX_REPOSITORIES: "[]",
		SUPERSET_SANDBOX_IMAGE_TAG: "image",
		SUPERSET_SANDBOX_PROVIDER: "vercel",
	} as const;

	test("a workspace with a drive names it in sandbox.conf, so the box can refuse without it", () => {
		expect(
			renderSandboxConf({
				...identity,
				...workspaceDriveIdentity("drive-ws-1", { laidOut: true }),
			}),
		).toContain(
			"SUPERSET_SANDBOX_DRIVE='drive-ws-1'\nSUPERSET_SANDBOX_DRIVE_LAID_OUT='1'\n",
		);
	});

	test("a workspace without a drive writes no drive key", () => {
		expect(workspaceDriveIdentity(null, { laidOut: true })).toEqual({});
		expect(
			renderSandboxConf({
				...identity,
				...workspaceDriveIdentity(undefined, { laidOut: false }),
			}),
		).not.toContain("SUPERSET_SANDBOX_DRIVE");
	});
});

describe("workspaceDriveNameToClaim", () => {
	test("an environment in drive mode gives a new workspace a drive", () => {
		expect(
			workspaceDriveNameToClaim({
				existing: null,
				goldenDriveName: "env-drive-env-1",
				providerSandboxId: "ws-1",
			}),
		).toBe("drive-ws-1");
	});

	test("an environment without a golden drive gives no drive at all", () => {
		expect(
			workspaceDriveNameToClaim({
				existing: null,
				goldenDriveName: null,
				providerSandboxId: "ws-1",
			}),
		).toBeNull();
	});

	test("a re-delivered provision keeps the name already on the row", () => {
		expect(
			workspaceDriveNameToClaim({
				existing: "drive-ws-old",
				goldenDriveName: "env-drive-env-1",
				providerSandboxId: "ws-new",
			}),
		).toBe("drive-ws-old");
	});
});

describe("forkWorkspaceDrive", () => {
	test("forks the golden drive", async () => {
		drives.set("golden", { region: "iad1" });
		await forkWorkspaceDrive({
			name: "drive-ws-1",
			region: "iad1",
			goldenDriveName: "golden",
			drives: host,
		});
		expect(calls).toEqual(["fork:golden->drive-ws-1"]);
	});

	test("finds the drive a previous delivery made", async () => {
		drives.set("golden", { region: "iad1" });
		drives.set("drive-ws-1", { region: "iad1" });
		await forkWorkspaceDrive({
			name: "drive-ws-1",
			region: "iad1",
			goldenDriveName: "golden",
			drives: host,
		});
		expect(calls).toEqual([]);
	});

	test("refuses a golden in another region", async () => {
		drives.set("golden", { region: "iad1" });
		await expect(
			forkWorkspaceDrive({
				name: "drive-ws-1",
				region: "sfo1",
				goldenDriveName: "golden",
				drives: host,
			}),
		).rejects.toThrow("is in iad1");
		expect(calls).toEqual([]);
	});

	test("never creates an empty drive", async () => {
		await expect(
			forkWorkspaceDrive({
				name: "drive-ws-1",
				region: "iad1",
				goldenDriveName: null,
				drives: host,
			}),
		).rejects.toThrow("no golden drive");
		await expect(
			forkWorkspaceDrive({
				name: "drive-ws-1",
				region: "iad1",
				goldenDriveName: "gone",
				drives: host,
			}),
		).rejects.toThrow("does not exist");
		expect(calls).toEqual([]);
	});
});

describe("waitForDriveDetached", () => {
	test("returns once the previous session lets go of the drive", async () => {
		let polls = 0;
		const flushing: DriveHost = {
			...host,
			find: async () => {
				polls++;
				return { region: "iad1", attachedTo: polls < 3 ? "ws-1" : undefined };
			},
		};
		await waitForDriveDetached("drive-ws-1", { drives: flushing, pollMs: 1 });
		expect(polls).toBe(3);
	});

	test("fails rather than mount a drive another session still writes", async () => {
		drives.set("drive-ws-1", { region: "iad1", attachedTo: "ws-1" });
		await expect(
			waitForDriveDetached("drive-ws-1", {
				drives: host,
				timeoutMs: 5,
				pollMs: 1,
			}),
		).rejects.toBeInstanceOf(DriveStillAttachedError);
	});
});

describe("deleteWorkspaceDrive", () => {
	test("deletes the drive, and treats one already gone as deleted", async () => {
		drives.set("drive-ws-1", { region: "iad1" });
		await deleteWorkspaceDrive("drive-ws-1", host);
		await deleteWorkspaceDrive("drive-ws-1", host);
		await deleteWorkspaceDrive(null, host);
		expect(calls).toEqual(["delete:drive-ws-1"]);
	});
});
