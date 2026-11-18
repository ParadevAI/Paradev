import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import { Sandbox } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	agentToolsMounts,
	findSandboxSession,
	listActiveWorkspaceSandboxes,
	listSandboxSessions,
	promoteSandboxToEnvironment,
	SESSION_TIMEOUT_MS,
	topUpSandboxSession,
	wakeSandbox,
} from "./vercel";

type ListOptions = NonNullable<Parameters<typeof Sandbox.list>[0]>;

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const sandboxes = [
	{
		name: "environment",
		status: "running",
		createdAt: NOW,
		updatedAt: NOW,
		statusUpdatedAt: NOW,
		tags: { kind: "environment" },
	},
	{
		name: "untagged",
		status: "running",
		createdAt: NOW - HOUR,
		updatedAt: NOW - HOUR,
		statusUpdatedAt: NOW - HOUR,
	},
	{
		name: "recently-stopped",
		status: "stopped",
		createdAt: NOW - DAY,
		updatedAt: NOW - DAY,
		statusUpdatedAt: NOW - 2 * HOUR,
		tags: { kind: "workspace" },
	},
	{
		name: "dormant",
		status: "stopped",
		createdAt: NOW - 3 * DAY,
		updatedAt: NOW - 3 * DAY,
		statusUpdatedAt: NOW - 2 * DAY,
		tags: { kind: "workspace" },
	},
	{
		name: "resumed-workspace",
		status: "running",
		createdAt: NOW - 7 * DAY,
		updatedAt: NOW - 7 * DAY,
		statusUpdatedAt: NOW - 3 * HOUR,
		expiresAt: NOW + HOUR,
		currentSessionId: "session_resumed",
		tags: { kind: "workspace" },
	},
];
let listOptions: ListOptions | undefined;

stub(Sandbox, {
	list: async (options: ListOptions) => {
		listOptions = options;
		const ordered = options.tags
			? sandboxes
					.filter((sandbox) => sandbox.tags?.kind === "workspace")
					.toSorted((a, b) => b.createdAt - a.createdAt)
			: sandboxes.toSorted((a, b) => b.statusUpdatedAt - a.statusUpdatedAt);
		return (async function* () {
			yield* ordered;
		})();
	},
});

describe("findSandboxSession", () => {
	stub(Sandbox, {
		get: async () => ({
			listSessions: async () =>
				(async function* () {
					for (let index = 0; index <= 20; index += 1) {
						yield {
							id: `session_${index}`,
							memory: 16_384,
							vcpus: 8,
							status: "stopped",
							startedAt: NOW - HOUR,
							stoppedAt: NOW,
							updatedAt: NOW,
						};
					}
				})(),
		}),
	});

	test("settlement finds a recorded session beyond the first page", async () => {
		expect(await findSandboxSession("workspace", "session_20")).toEqual({
			session: {
				id: "session_20",
				memoryMb: 16_384,
				vcpus: 8,
				startedAt: NOW - HOUR,
				endedAt: NOW,
				activeCpuMs: null,
			},
		});
	});
});

describe("listSandboxSessions", () => {
	const raw = (id: string, startedAt: number, stoppedAt?: number) => ({
		id,
		memory: 8192,
		vcpus: 4,
		status: stoppedAt === undefined ? "running" : "stopped",
		startedAt,
		...(stoppedAt === undefined ? {} : { stoppedAt }),
		updatedAt: stoppedAt ?? startedAt,
	});
	let read = 0;
	stub(Sandbox, {
		get: async () => ({
			listSessions: async () =>
				(async function* () {
					for (const session of [
						raw("live", NOW - 10 * 60_000),
						raw("recent", NOW - 50 * 60_000, NOW - 20 * 60_000),
						raw("old", NOW - 3 * HOUR, NOW - 2 * HOUR),
						raw("older", NOW - 5 * HOUR, NOW - 4 * HOUR),
					]) {
						read += 1;
						yield session;
					}
				})(),
		}),
	});

	test("lists the live session and those ended since, and reads no further back", async () => {
		const sessions = await listSandboxSessions("ws-box", NOW - HOUR);
		expect(sessions?.map((session) => session.id)).toEqual(["live", "recent"]);
		expect(read).toBe(3);
	});
});

describe("promoteSandboxToEnvironment", () => {
	const sourceCalls: string[] = [];
	const source = {
		status: "running",
		region: "iad1",
		vcpus: 4,
		currentSession: () => ({ sessionId: "sess_A" }),
		snapshot: async () => {
			sourceCalls.push("snapshot");
			return { snapshotId: "snap_1" };
		},
		writeFiles: async () => {
			sourceCalls.push("writeFiles");
		},
		runCommand: async () => {
			sourceCalls.push("runCommand");
		},
		mkDir: async () => {
			sourceCalls.push("mkDir");
		},
	};
	const golden = {
		currentSnapshotId: "snap_golden_0",
		runCommand: async () => {},
		stop: async () => {},
	};
	let createTags: unknown;
	stub(Sandbox, {
		get: async ({ name }: { name: string }) =>
			name === "ws-box"
				? source
				: { status: "stopped", currentSnapshotId: "snap_golden_1" },
		create: async (params: { tags: unknown }) => {
			createTags = params.tags;
			return golden;
		},
	});

	test("ends the source's session for the snapshot and leaves its restart to the caller", async () => {
		expect(
			await promoteSandboxToEnvironment({
				sourceSandbox: "ws-box",
				goldenName: "env-1",
				organizationId: "org_1",
			}),
		).toEqual({
			goldenName: "env-1",
			region: "iad1",
			stopped: { sessionId: "sess_A" },
		});
		expect(sourceCalls).toEqual(["snapshot"]);
		expect(createTags).toEqual({ kind: "environment", org: "org_1" });
	});
});

describe("wakeSandbox", () => {
	type Box = { memoryMb: number; vcpus: number };
	let running: boolean;
	let onResume: (sandbox: unknown) => Promise<void>;
	const box = {
		get status() {
			return running ? "running" : "stopped";
		},
		expiresAt: new Date(NOW + 60_000),
		vcpus: 4,
		domain: () => "https://box.test",
		currentSession: () => ({ vcpus: 8, sessionId: "sess_new" }),
		update: async () => {},
		writeFiles: async () => {},
		// The SDK's withResume: a call on a stopped session resumes it, then retries.
		extendTimeout: async () => {
			await onResume(box);
		},
		runCommand: async () => {
			await onResume(box);
			throw new Error("stop before settle");
		},
	};
	stub(Sandbox, {
		get: async (params: { onResume: typeof onResume }) => {
			onResume = params.onResume;
			return box;
		},
	});
	stub(globalThis, { fetch: async () => new Response("{}") });
	const identity = {
		SUPERSET_SANDBOX_CONTRACT: "1",
		SUPERSET_API_URL: "https://api.test",
		SUPERSET_SANDBOX_WORKSPACE_ID: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
		SUPERSET_SANDBOX_ORGANIZATION_ID: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
		SUPERSET_SANDBOX_REPOSITORIES: "[]",
		SUPERSET_SANDBOX_IMAGE_TAG: "image",
		SUPERSET_SANDBOX_PROVIDER: "vercel",
		SUPERSET_BUNDLE_SHA: "a".repeat(64),
	};
	async function wake(): Promise<Box[]> {
		const authorized: Box[] = [];
		await wakeSandbox({
			providerSandboxId: "ws-box",
			claim: { vcpus: 4, identity, networkPolicy: {} } as never,
			beforeResume: async (resumed) => {
				authorized.push(resumed);
				if (running) throw new Error("stop before settle");
			},
		}).catch((error: Error) => {
			if (error.message !== "stop before settle") throw error;
		});
		return authorized;
	}

	test("a box read running that a call resumed runs beforeResume for the new session", async () => {
		running = true;
		expect(await wake()).toEqual([
			{
				memoryMb: 16_384,
				vcpus: 8,
				resumedSession: { sessionId: "sess_new", expiresAt: box.expiresAt },
			},
		]);
	});

	test("a box read stopped runs beforeResume once, before its own resume", async () => {
		running = false;
		expect(await wake()).toEqual([{ memoryMb: 8192, vcpus: 4 }]);
	});
});

describe("listActiveWorkspaceSandboxes", () => {
	test("finds older resumed workspaces when tag-filtered lists use creation order", async () => {
		expect(await listActiveWorkspaceSandboxes(NOW - 4 * HOUR)).toEqual([
			{ name: "recently-stopped", expiresAt: null, sessionId: null },
			{
				name: "resumed-workspace",
				expiresAt: new Date(NOW + HOUR),
				sessionId: "session_resumed",
			},
		]);
		expect(listOptions).toMatchObject({
			sortBy: "statusUpdatedAt",
			sortOrder: "desc",
		});
		expect(listOptions).not.toHaveProperty("tags");
	});
});

describe("topUpSandboxSession", () => {
	let expiresAt: Date;
	const extended: number[] = [];
	stub(Sandbox, {
		get: async () => ({
			status: "running",
			get expiresAt() {
				return expiresAt;
			},
			currentSession: () => ({
				extendTimeout: async (ms: number) => {
					extended.push(ms);
				},
			}),
		}),
	});
	beforeAll(() => setSystemTime(new Date(NOW)));
	afterAll(() => setSystemTime());

	test("extends a session to end a full timeout from now, unless it nearly does", async () => {
		expiresAt = new Date(NOW + SESSION_TIMEOUT_MS / 2);
		await topUpSandboxSession("sbx");
		expect(extended).toEqual([SESSION_TIMEOUT_MS / 2]);

		expiresAt = new Date(NOW + SESSION_TIMEOUT_MS - 30_000);
		await topUpSandboxSession("sbx");
		expect(extended).toEqual([SESSION_TIMEOUT_MS / 2]);
	});
});

describe("agentToolsMounts", () => {
	const detached = () => Promise.resolve({ currentSandboxName: undefined });

	test("mounts nothing without a drive name", async () => {
		let asked = 0;
		const getDrive = () => {
			asked++;
			return detached();
		};
		expect(await agentToolsMounts(null, getDrive)).toBeUndefined();
		expect(asked).toBe(0);
	});

	test("mounts a detached drive read-only, and asks only once", async () => {
		let asked = 0;
		const getDrive = () => {
			asked++;
			return detached();
		};
		const want = {
			"/opt/agents": {
				drive: "agent-tools-iad1-0123456789ab",
				mode: "snapshot",
			},
		};
		expect(
			await agentToolsMounts("agent-tools-iad1-0123456789ab", getDrive),
		).toEqual(want);
		expect(
			await agentToolsMounts("agent-tools-iad1-0123456789ab", getDrive),
		).toEqual(want);
		expect(asked).toBe(1);
	});

	test("skips a missing drive, or one a writer still holds", async () => {
		expect(
			await agentToolsMounts("agent-tools-sfo1-aaaaaaaaaaaa", () =>
				Promise.reject(new Error("404")),
			),
		).toBeUndefined();
		let asked = 0;
		const attached = () => {
			asked++;
			return Promise.resolve({ currentSandboxName: "builder" });
		};
		expect(
			await agentToolsMounts("agent-tools-sfo1-bbbbbbbbbbbb", attached),
		).toBeUndefined();
		expect(
			await agentToolsMounts("agent-tools-sfo1-bbbbbbbbbbbb", attached),
		).toBeUndefined();
		expect(asked).toBe(2);
	});
});
