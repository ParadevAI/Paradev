import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../test/stub";
import * as sandbox from "../../lib/sandbox";
import * as jobs from "./jobs";
import {
	TEARDOWN_ATTEMPTS,
	TEARDOWN_JOB_PATH,
	teardownSandbox,
} from "./teardown";
import * as guard from "./teardown-guard";

let calls: string[] = [];
let namedOnRead: boolean[] = [];
let deleteFails = false;
let queued: Array<{ path: string; body: unknown; delaySeconds?: number }> = [];

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
});

const input = { providerSandboxId: "ws-old", driveName: null, attempt: 0 };

describe("teardownSandbox", () => {
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
			{ path: TEARDOWN_JOB_PATH, body: { ...input, attempt: 1 } },
		]);
		queued = [];
		expect(
			await teardownSandbox({ ...input, attempt: TEARDOWN_ATTEMPTS - 1 }),
		).toBe("abandoned");
		expect(queued).toEqual([]);
	});
});
