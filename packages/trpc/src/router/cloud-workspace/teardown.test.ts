import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import {
	deleteSandboxAndDriveLater,
	retireAndTearDown,
	TEARDOWN_ATTEMPTS,
	teardownSandbox,
} from "./teardown";
import * as guard from "./teardown-guard";

let calls: string[] = [];
let namedOnRead: boolean[] = [];
let deleteFails = false;
let queued: Array<{ path: string; body: unknown; delaySeconds?: number }> = [];
let updateMatches = true;
let renamedTo: unknown;
let written: unknown;

stub(guard, {
	liveReferences: async () => ({ sandbox: namedOnRead.shift() ?? false }),
});
stub(sandbox, {
	stopSandbox: async (name: string) => {
		calls.push(`stop:${name}`);
		return { sessionId: null };
	},
	deleteSandbox: async (name: string) => {
		if (deleteFails) throw new Error("vercel down");
		calls.push(`delete:${name}`);
	},
});
stub(db, {
	update: () => ({
		set: (values: { providerSandboxId: string }) => {
			renamedTo = values.providerSandboxId;
			written = values;
			return {
				where: () => ({
					returning: async () => (updateMatches ? [{ id: "ws_1" }] : []),
				}),
			};
		},
	}),
});
stub(jobs, {
	publishCloudWorkspaceJob: async (job: {
		path: string;
		body: unknown;
		delaySeconds?: number;
	}) => {
		queued.push(job);
	},
});

beforeEach(() => {
	calls = [];
	namedOnRead = [];
	deleteFails = false;
	queued = [];
	updateMatches = true;
	renamedTo = undefined;
});

const input = { providerSandboxId: "ws-old", driveName: null, attempt: 0 };

describe("teardownSandbox", () => {
	test("outside production it stops and deletes nothing", async () => {
		process.env.VERCEL_ENV = "preview";
		try {
			expect(await teardownSandbox(input)).toBe("skipped");
		} finally {
			process.env.VERCEL_ENV = "production";
		}
		expect(calls).toEqual([]);
	});

	test("stops, then deletes a box no row names", async () => {
		expect(await teardownSandbox(input)).toBe("deleted");
		expect(calls).toEqual(["stop:ws-old", "delete:ws-old"]);
	});

	test("keeps a box a row names by the time it would delete it", async () => {
		namedOnRead = [false, true];
		expect(await teardownSandbox(input)).toBe("kept");
		expect(calls).toEqual(["stop:ws-old"]);
	});

	test("a failure requeues the next attempt, and the last attempt gives up", async () => {
		deleteFails = true;
		expect(await teardownSandbox(input)).toBe("retrying");
		expect(queued).toMatchObject([
			{
				path: "/api/cloud-workspaces/teardown",
				body: { ...input, attempt: 1 },
			},
		]);
		queued = [];
		expect(
			await teardownSandbox({ ...input, attempt: TEARDOWN_ATTEMPTS - 1 }),
		).toBe("abandoned");
		expect(queued).toEqual([]);
	});
});

describe("retireAndTearDown", () => {
	const row = { id: "ws_1", providerSandboxId: "ws-old", driveName: null };

	test("gives the row a new box name, and its status in the same write, and queues the old box's teardown only when the update matched", async () => {
		updateMatches = false;
		expect(await retireAndTearDown(row, undefined)).toBe(false);
		expect(queued).toEqual([]);
		updateMatches = true;
		expect(await retireAndTearDown(row, undefined, { status: "failed" })).toBe(
			true,
		);
		expect(renamedTo).toMatch(/^ws-ws_1[0-9a-f]{8}$/);
		expect(written).toMatchObject({ status: "failed" });
		expect(queued).toMatchObject([
			{ path: "/api/cloud-workspaces/teardown", body: input },
		]);
		expect(calls).toEqual([]);
	});
});

describe("deleteSandboxAndDriveLater", () => {
	test("a box without a drive goes through the retried job too, not an inline delete", async () => {
		await deleteSandboxAndDriveLater({
			providerSandboxId: "ws-old",
			driveName: null,
		});
		expect(calls).toEqual([]);
		expect(queued).toMatchObject([
			{ path: "/api/cloud-workspaces/teardown", body: input },
		]);
	});
});
