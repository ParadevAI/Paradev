import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";
import { APIError, Drive, Sandbox } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	agentToolsMounts,
	applySandboxPolicy,
	composeMounts,
	DRIVE_REFUSAL_LIMIT,
	deleteSandbox,
	deleteSandboxAndDrive,
	describeSandbox,
	driveBootsIn,
	driveRefusalIn,
	findSandboxSession,
	listActiveWorkspaceSandboxes,
	listSandboxSessions,
	persistentDriveRefusals,
	promoteSandboxToEnvironment,
	provisionSandbox,
	type ResumeLock,
	type SandboxClaim,
	SandboxDriveMissingError,
	SandboxDriveRefusedError,
	SandboxNotReadyError,
	SandboxUnavailableError,
	SESSION_TIMEOUT_MS,
	sandboxExists,
	settleSandbox,
	stopSandbox,
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
							networkTransfer: { ingress: 4_096, egress: 2_048 },
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
				egressBytes: 2_048,
				crashed: false,
			},
		});
	});
});

describe("a session Vercel aborted", () => {
	stub(Sandbox, {
		get: async () => ({
			listSessions: async () =>
				(async function* () {
					yield {
						id: "session_1",
						memory: 8192,
						vcpus: 4,
						status: "aborted",
						startedAt: NOW - HOUR,
						abortedAt: NOW,
						updatedAt: NOW,
					};
				})(),
		}),
	});

	test("is a crash", async () => {
		const found = await findSandboxSession("workspace", "session_1");
		expect(found?.session?.crashed).toBe(true);
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

/**
 * A box the way the SDK presents it: the handle keeps the status it was read
 * with, a session call on a stopped session fails, and a handle call resumes
 * it first, which `resumes` records.
 */
function fakeBox(read: "running" | "stopped") {
	const box = {
		live: read,
		snapshotId: "snap_stop_0",
		resumes: [] as string[],
	};
	const stoppedError = () => new APIError(new Response(null, { status: 410 }));
	const session = {
		sessionId: "sess_A",
		vcpus: 4,
		update: async () => {
			if (box.live !== "running") throw stoppedError();
		},
		extendTimeout: async () => {
			if (box.live !== "running") throw stoppedError();
		},
		snapshot: async () => {
			if (box.live !== "running") throw stoppedError();
			box.live = "stopped";
			return { snapshotId: "snap_now" };
		},
	};
	const resumingCall = (method: string) => async () => {
		if (box.live !== "running") {
			box.resumes.push(method);
			box.live = "running";
		}
		return method === "snapshot" ? session.snapshot() : undefined;
	};
	const handle = () => ({
		name: "ws-box",
		status: box.live,
		region: "iad1",
		vcpus: 4,
		currentSnapshotId: box.snapshotId,
		expiresAt: new Date(NOW + HOUR / 2),
		domain: () => "https://box.test",
		currentSession: () => session,
		update: async (params: { networkPolicy?: unknown }) => {
			if (params.networkPolicy && handleStatus === "running") {
				await session.update();
			}
		},
		delete: async () => {},
		listSessions: async () => (async function* () {})(),
		snapshot: resumingCall("snapshot"),
		runCommand: resumingCall("runCommand"),
		writeFiles: resumingCall("writeFiles"),
		extendTimeout: resumingCall("extendTimeout"),
	});
	let handleStatus: string = read;
	const stopNow = () => {
		box.live = "stopped";
		box.snapshotId = "snap_stop_1";
	};
	return {
		box,
		stopNow,
		get: async () => {
			const read = handle();
			handleStatus = read.status;
			return read;
		},
	};
}

/** The idle timeout ends the session after the first read, before any call. */
function stopsAfterRead(fake: ReturnType<typeof fakeBox>) {
	const read = fake.get;
	let reads = 0;
	fake.get = async () => {
		const handle = await read();
		if (++reads === 1) fake.stopNow();
		return handle;
	};
	return fake;
}

describe("a caller that is not a wake leaves a stopped box stopped", () => {
	let fake = fakeBox("stopped");
	stub(Sandbox, { get: async () => fake.get() });

	test("reads, stops, deletes, session lists, policy and top-up", async () => {
		fake = fakeBox("stopped");
		await describeSandbox("ws-box");
		await sandboxExists("ws-box");
		await stopSandbox("ws-box");
		await listSandboxSessions("ws-box", NOW - HOUR);
		await findSandboxSession("ws-box", null);
		expect(
			await applySandboxPolicy({
				providerSandboxId: "ws-box",
				networkPolicy: {},
			}),
		).toBe("not-running");
		expect(await topUpSandboxSession("ws-box")).toBeNull();
		await deleteSandbox("ws-box");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});

	test("policy and top-up find the box stopped since they read it running", async () => {
		fake = stopsAfterRead(fakeBox("running"));
		expect(
			await applySandboxPolicy({
				providerSandboxId: "ws-box",
				networkPolicy: {},
			}),
		).toBe("not-running");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });

		fake = stopsAfterRead(fakeBox("running"));
		expect(await topUpSandboxSession("ws-box")).toBeNull();
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});
});

describe("promoteSandboxToEnvironment", () => {
	let fake = fakeBox("running");
	let sourceSnapshot: string | undefined;
	let createTags: unknown;
	const golden = {
		currentSnapshotId: "snap_golden_0",
		runCommand: async () => ({ exitCode: 0 }),
		stop: async () => {},
	};
	stub(Sandbox, {
		get: async ({ name }: { name: string }) =>
			name === "ws-box"
				? fake.get()
				: { status: "stopped", currentSnapshotId: "snap_golden_1" },
		create: async (params: {
			tags: unknown;
			source: { snapshotId: string };
		}) => {
			createTags = params.tags;
			sourceSnapshot = params.source.snapshotId;
			return golden;
		},
	});
	const promote = () =>
		promoteSandboxToEnvironment({
			sourceSandbox: "ws-box",
			goldenName: "env-1",
			organizationId: "org_1",
		});

	test("snapshots a running source through its session and leaves its restart to the caller", async () => {
		fake = fakeBox("running");
		expect(await promote()).toEqual({
			goldenName: "env-1",
			region: "iad1",
			goldenDriveName: null,
			stopped: { sessionId: "sess_A" },
		});
		expect(sourceSnapshot).toBe("snap_now");
		expect(createTags).toEqual({ kind: "environment", org: "org_1" });
		expect(fake.box.resumes).toEqual([]);
	});

	test("builds from a stopped source's last stop without resuming it", async () => {
		fake = fakeBox("stopped");
		expect((await promote()).stopped).toBeNull();
		expect(sourceSnapshot).toBe("snap_stop_0");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});

	test("a stopped source with no snapshot to build from fails at once", async () => {
		fake = fakeBox("stopped");
		fake.box.snapshotId = undefined;
		sourceSnapshot = undefined;
		await expect(promote()).rejects.toBeInstanceOf(SandboxUnavailableError);
		expect(sourceSnapshot).toBeUndefined();
		expect(fake.box.resumes).toEqual([]);
	});

	test("a source that stops before its snapshot is built from that stop's snapshot", async () => {
		fake = stopsAfterRead(fakeBox("running"));
		await promote();
		expect(sourceSnapshot).toBe("snap_stop_1");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});
});

describe("wakeSandbox", () => {
	type Box = { memoryMb: number; vcpus: number };
	let running: boolean;
	let onResume: (sandbox: unknown) => Promise<void>;
	const calls: string[] = [];
	const box = {
		get status() {
			return running ? "running" : "stopped";
		},
		expiresAt: new Date(NOW + 60_000),
		vcpus: 4,
		domain: () => "https://box.test",
		currentSession: () => ({ vcpus: 8, sessionId: "sess_new" }),
		update: async () => {
			calls.push("update");
		},
		writeFiles: async () => {
			calls.push("writeFiles");
		},
		// The SDK's withResume: a call on a stopped session resumes it, then retries.
		extendTimeout: async () => {
			calls.push("extendTimeout");
			await onResume(box);
		},
		runCommand: async () => {
			calls.push("runCommand");
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
	async function _wake(): Promise<Box[]> {
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

	test("a wake only for a running box leaves a box that stopped since the caller looked", async () => {
		running = false;
		calls.length = 0;
		const woken = await wakeSandbox({
			providerSandboxId: "ws-box",
			claim: { vcpus: 4, identity, networkPolicy: {} } as never,
			onlyIfRunning: true,
			beforeResume: async () => {
				calls.push("beforeResume");
			},
		});
		expect(woken).toBeNull();
		expect(calls).toEqual([]);
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

describe("wakeSandbox mounts", () => {
	const RESUMED = new Error("resumed");
	let status: "running" | "stopped";
	let current: Record<string, unknown>;
	let events: string[];
	let updates: Array<Record<string, unknown>>;
	const fake = {
		get status() {
			return status;
		},
		get mounts() {
			return current;
		},
		vcpus: 4,
		region: "iad1",
		domain: () => "https://box.invalid",
		update: async (params: Record<string, unknown>) => {
			events.push("update");
			updates.push(params);
		},
		extendTimeout: async () => {},
		writeFiles: async () => {
			throw RESUMED;
		},
		currentSession: () => fake,
	};
	stub(Sandbox, { get: async () => fake });
	let attachedTo: string | undefined;
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			events.push(`drive:${name}`);
			// The concurrent wake that took the drive has resumed the box.
			if (attachedTo) status = "running";
			return { name, currentSandboxName: attachedTo };
		},
	});
	stub(globalThis, {
		fetch: async () => {
			throw new Error("no network in tests");
		},
	});
	const drive = { drive: "drive-1", mode: "read-write" };
	const mounts = { [SANDBOX_PATHS.drive]: drive };
	const claim = { vcpus: 4, files: [], networkPolicy: {} } as never;
	const withAgentTools = {
		...(claim as object),
		agentTools: true,
		identity: { SUPERSET_BUNDLE_SHA: `feedfacecafe${"0".repeat(52)}` },
	} as never;
	const stopAtResume = async () => {
		events.push("resume");
		throw RESUMED;
	};

	beforeEach(() => {
		current = {};
		events = [];
		updates = [];
		attachedTo = undefined;
	});

	test("a drive a concurrent wake already resumed this box with is not foreign", async () => {
		status = "stopped";
		attachedTo = "sbx";
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim,
				mounts: mounts as never,
				beforeResume: stopAtResume,
			}),
		).rejects.toThrow();
		expect(events).not.toContain("resume");
		expect(updates.some((update) => "mounts" in update)).toBe(false);
	});

	test("a stopped box waits for its drive, then gets its mounts, then resumes", async () => {
		status = "stopped";
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim,
				mounts: mounts as never,
				beforeResume: stopAtResume,
			}),
		).rejects.toBe(RESUMED);
		expect(events).toEqual(["drive:drive-1", "update", "resume"]);
		expect(updates).toEqual([{ mounts }]);
	});

	test("the drive and the agent-tools drive share one mounts object", async () => {
		status = "stopped";
		const agents = "agent-tools-iad1-feedfacecafe";
		current = {
			[SANDBOX_PATHS.agents]: { drive: "agent-tools-old", mode: "snapshot" },
		};
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim: withAgentTools,
				mounts: mounts as never,
				beforeResume: stopAtResume,
			}),
		).rejects.toBe(RESUMED);
		expect(updates).toEqual([
			{
				mounts: {
					[SANDBOX_PATHS.drive]: drive,
					[SANDBOX_PATHS.agents]: { drive: agents, mode: "snapshot" },
				},
			},
		]);
	});

	test("an agent-tools update keeps the drive the box already has", async () => {
		status = "stopped";
		current = { [SANDBOX_PATHS.drive]: drive };
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim: withAgentTools,
				beforeResume: stopAtResume,
			}),
		).rejects.toBe(RESUMED);
		expect(updates[0]?.mounts).toMatchObject({ [SANDBOX_PATHS.drive]: drive });
	});

	test("a box without a drive gets no mount update", async () => {
		status = "stopped";
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim,
				beforeResume: stopAtResume,
			}),
		).rejects.toBe(RESUMED);
		expect(updates).toEqual([]);
	});

	test("a running box keeps the mounts its session started with", async () => {
		status = "running";
		await expect(
			wakeSandbox({ providerSandboxId: "sbx", claim, mounts: mounts as never }),
		).rejects.toThrow();
		expect(updates).toEqual([{ networkPolicy: {} }]);
		expect(events).not.toContain("drive:drive-1");
	});
});

describe("resume under one lock", () => {
	let status: "running" | "stopped";
	let attachedTo: string | undefined;
	let events: string[];
	let gate: Promise<void>;
	let bootLog: string;
	let refuse: boolean;
	const box = () => ({
		get status() {
			return status;
		},
		mounts: {},
		vcpus: 4,
		domain: () => "https://box.invalid",
		expiresAt: undefined,
		update: async (params: Record<string, unknown>) => {
			if (params.mounts) {
				events.push("mount");
				await gate;
			}
		},
		writeFiles: async () => {
			events.push("write");
		},
		runCommand: async (command: { env?: Record<string, string> }) => {
			events.push("boot");
			status = "running";
			const id = command.env?.SUPERSET_BOOT_ID ?? "";
			if (refuse) {
				bootLog = `1 boot.start pid=1 boot=${id}\n2 drive.missing drive-1 is not mounted at /mnt/superset-drive\n`;
			}
		},
		readFileToBuffer: async () => Buffer.from(bootLog),
		stop: async () => {
			events.push("stop");
			status = "stopped";
		},
	});
	stub(Sandbox, {
		get: async () => {
			const fake = box();
			return { ...fake, currentSession: () => fake };
		},
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			events.push(`drive:${attachedTo ?? "detached"}`);
			const holder = attachedTo;
			// The session that stopped finishes saving and lets go.
			attachedTo = undefined;
			return { name, currentSandboxName: holder };
		},
	});
	stub(globalThis, {
		fetch: async () => {
			throw new Error("not answering");
		},
	});
	const mounts = {
		[SANDBOX_PATHS.drive]: { drive: "drive-1", mode: "read-write" },
	} as never;
	const claim = {
		identity: {
			SUPERSET_SANDBOX_CONTRACT: "1",
			SUPERSET_BUNDLE_SHA: "0".repeat(64),
			SUPERSET_API_URL: "https://api.invalid",
			SUPERSET_SANDBOX_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
			SUPERSET_SANDBOX_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000002",
			SUPERSET_SANDBOX_REPOSITORIES: "[]",
			SUPERSET_SANDBOX_IMAGE_TAG: "env-g",
			SUPERSET_SANDBOX_PROVIDER: "vercel",
			SUPERSET_SANDBOX_DRIVE: "drive-1",
		},
		hostSecret: "s",
		files: [],
		vcpus: 4,
		networkPolicy: {},
	} as never;
	let holder: string | null;
	const lock =
		(who: string): ResumeLock =>
		async (step) => {
			if (holder) throw new SandboxNotReadyError("sbx");
			holder = who;
			events.push(`lock:${who}`);
			try {
				return await step();
			} finally {
				holder = null;
			}
		};

	beforeEach(() => {
		status = "stopped";
		attachedTo = undefined;
		events = [];
		gate = Promise.resolve();
		bootLog = "";
		refuse = false;
		holder = null;
	});

	test("a redelivered provision whose box stopped waits for the drive before anything resumes it", async () => {
		attachedTo = "sbx";
		await provisionSandbox({
			name: "sbx",
			environment: { sourceKind: "fork", sourceRef: "env-g", region: "iad1" },
			claim,
			mounts,
			exclusive: lock("provision"),
		});
		expect(events).toEqual([
			"lock:provision",
			"drive:sbx",
			"drive:detached",
			"mount",
			"write",
			"boot",
		]);
	});

	test("a second wake while the first resumes does not resume the box; it answers still starting", async () => {
		let open = () => {};
		gate = new Promise((resolve) => {
			open = resolve;
		});
		const first = wakeSandbox({
			providerSandboxId: "sbx",
			claim,
			mounts,
			exclusive: lock("first"),
		}).catch((error: unknown) => error);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const second = await wakeSandbox({
			providerSandboxId: "sbx",
			claim,
			mounts,
			exclusive: lock("second"),
		}).catch((error: unknown) => error);
		expect(second).toBeInstanceOf(SandboxNotReadyError);
		expect(events).toEqual(["lock:first", "drive:detached", "mount"]);
		refuse = true;
		open();
		const outcome = await first;
		expect(outcome).toBeInstanceOf(SandboxDriveMissingError);
		// The refused box is stopped under the lock, so no wake can resume it in between.
		expect(events).toEqual([
			"lock:first",
			"drive:detached",
			"mount",
			"write",
			"boot",
			"lock:first",
			"stop",
		]);
	});
});

describe("a box found running", () => {
	const ended = new Error("session ended");
	const booted = new Error("booted on the new session");
	let calls: string[];
	let status: "running" | "stopped";
	let attachedTo: string | undefined;
	const endedSession = {
		extendTimeout: async () => {
			calls.push("old-session:extend");
			// The extension past the plan's cap is refused, and the session ends.
			status = "stopped";
			attachedTo = "sbx";
			throw ended;
		},
		update: async () => {
			calls.push("old-session:policy");
			throw ended;
		},
		writeFiles: async () => {
			calls.push("old-session:write");
			throw ended;
		},
		runCommand: async () => {
			calls.push("old-session:boot");
			throw ended;
		},
	};
	const newSession = {
		sessionId: "sess-new",
		vcpus: 8,
		extendTimeout: async () => {},
		update: async () => {},
		writeFiles: async () => {
			calls.push("new-session:write");
		},
		runCommand: async () => {
			calls.push("new-session:boot");
			throw booted;
		},
	};
	// A Sandbox method other than a config update would resume a session that ended.
	const resumes = (name: string) => async () => {
		calls.push(`sandbox:${name}`);
	};
	stub(Sandbox, {
		get: async ({ resume }: { resume?: boolean }) => {
			if (resume) {
				calls.push("resume");
				status = "running";
			}
			return {
				status,
				mounts: {},
				vcpus: 4,
				expiresAt: new Date(Date.now() + 1000),
				domain: () => "https://box.invalid",
				extendTimeout: resumes("extend"),
				update: async (params: Record<string, unknown>) => {
					calls.push(params.mounts ? "mount" : "sandbox:update");
				},
				writeFiles: resumes("write"),
				runCommand: resumes("boot"),
				currentSession: () => (resume ? newSession : endedSession),
			};
		},
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			calls.push(`drive:${attachedTo ?? "detached"}`);
			const holder = attachedTo;
			attachedTo = undefined;
			return { name, currentSandboxName: holder };
		},
	});
	stub(globalThis, {
		fetch: async () => {
			throw new Error("not answering");
		},
	});

	beforeEach(() => {
		calls = [];
		status = "running";
		attachedTo = undefined;
	});

	const wake = (
		beforeResume?: Parameters<typeof wakeSandbox>[0]["beforeResume"],
	) =>
		wakeSandbox({
			providerSandboxId: "sbx",
			claim: {
				identity: {
					SUPERSET_SANDBOX_CONTRACT: "1",
					SUPERSET_BUNDLE_SHA: "0".repeat(64),
					SUPERSET_API_URL: "https://api.invalid",
					SUPERSET_SANDBOX_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
					SUPERSET_SANDBOX_ORGANIZATION_ID:
						"00000000-0000-4000-8000-000000000002",
					SUPERSET_SANDBOX_REPOSITORIES: "[]",
					SUPERSET_SANDBOX_IMAGE_TAG: "env-g",
					SUPERSET_SANDBOX_PROVIDER: "vercel",
					SUPERSET_SANDBOX_DRIVE: "drive-1",
				},
				files: [{ path: "/x", content: "y" }],
				networkPolicy: {},
				vcpus: 4,
			} as never,
			mounts: {
				[SANDBOX_PATHS.drive]: { drive: "drive-1", mode: "read-write" },
			} as never,
			beforeResume,
		});

	test("whose session ends during the wake is resumed only after the drive check", async () => {
		await expect(wake()).rejects.toBe(booted);
		expect(calls.filter((call) => call.startsWith("sandbox:"))).toEqual([]);
		const resumedAt = calls.indexOf("resume");
		expect(calls.slice(0, resumedAt)).toContain("drive:sbx");
		expect(calls.slice(0, resumedAt)).toContain("drive:detached");
		expect(calls.slice(0, resumedAt)).toContain("mount");
		expect(calls.slice(resumedAt)).toEqual([
			"resume",
			"new-session:write",
			"new-session:write",
			"new-session:boot",
		]);
	});

	test("whose session ends during the wake meters the session resumed here before it boots", async () => {
		const metered: unknown[] = [];
		await expect(
			wake(async (box) => {
				metered.push(box);
				calls.push("metered");
			}),
		).rejects.toBe(booted);
		expect(metered).toEqual([
			{
				memoryMb: 16_384,
				vcpus: 8,
				resumedSession: { sessionId: "sess-new", expiresAt: expect.any(Date) },
			},
		]);
		expect(calls.indexOf("metered")).toBeLessThan(
			calls.indexOf("new-session:boot"),
		);
	});
});

describe("a new box on a drive", () => {
	let events: string[];
	let attachedTo: string | undefined;
	const session = {
		writeFiles: async () => {
			events.push("write");
		},
		runCommand: async () => {
			events.push("boot");
		},
	};
	stub(Sandbox, {
		get: async () => {
			throw new APIError(new Response(null, { status: 404 }));
		},
		fork: async () => {
			events.push("create");
			return {
				domain: () => "https://box.invalid",
				expiresAt: undefined,
				currentSession: () => session,
			};
		},
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			events.push(`drive:${attachedTo ?? "detached"}`);
			const holder = attachedTo;
			attachedTo = undefined;
			return { name, currentSandboxName: holder };
		},
	});

	beforeEach(() => {
		events = [];
		attachedTo = undefined;
	});

	test("is created only once a box of another name has let go of the drive", async () => {
		// An undo's second provision: the first job's box still holds the drive.
		attachedTo = "ws-box-1";
		await provisionSandbox({
			name: "ws-box-2",
			environment: { sourceKind: "fork", sourceRef: "env-g", region: "iad1" },
			claim: {
				identity: {
					SUPERSET_SANDBOX_CONTRACT: "1",
					SUPERSET_BUNDLE_SHA: "0".repeat(64),
					SUPERSET_API_URL: "https://api.invalid",
					SUPERSET_SANDBOX_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
					SUPERSET_SANDBOX_ORGANIZATION_ID:
						"00000000-0000-4000-8000-000000000002",
					SUPERSET_SANDBOX_REPOSITORIES: "[]",
					SUPERSET_SANDBOX_IMAGE_TAG: "env-g",
					SUPERSET_SANDBOX_PROVIDER: "vercel",
				},
				hostSecret: "s",
				files: [],
				vcpus: 4,
				networkPolicy: {},
			} as never,
			mounts: {
				[SANDBOX_PATHS.drive]: { drive: "drive-1", mode: "read-write" },
			} as never,
		});
		expect(events).toEqual([
			"drive:ws-box-1",
			"drive:detached",
			"create",
			"write",
			"boot",
		]);
	});
});

describe("composeMounts", () => {
	test("merges parts, a later part winning a shared path, and drops empty", () => {
		const a = { "/a": { drive: "a", mode: "read-write" as const } };
		const b = { "/a": { drive: "b", mode: "snapshot" as const } };
		expect(composeMounts(a, undefined, b)).toEqual(b);
		expect(composeMounts(undefined, {})).toBeUndefined();
	});
});

describe("drive refusals in the boot log", () => {
	const boot = (at: number, id: string, ...lines: string[]) =>
		[`${at} boot.start pid=1 bundle=abc boot=${id}`, ...lines].join("\n");

	test("only this boot's lines count, so a previous boot's refusal never stops a healthy box", () => {
		const log = [
			boot(
				1,
				"old",
				"2 drive.missing drive-1 is not mounted at /mnt/superset-drive",
			),
			boot(3, "new", "4 run.cleared"),
		].join("\n");
		expect(driveRefusalIn(log, "old")).toBe(
			"drive.missing drive-1 is not mounted at /mnt/superset-drive",
		);
		expect(driveRefusalIn(log, "new")).toBeNull();
		expect(driveRefusalIn(log, "not-started-yet")).toBeNull();
	});

	test("a reexec's second boot.start joins its boot", () => {
		const log = boot(
			1,
			"b",
			"2 boot.reexec into the installed bundle's script",
			"3 boot.start pid=2 bundle=abc boot=b",
			"4 drive.foreign drive-1 belongs to workspace w",
		);
		expect(driveBootsIn(log)).toHaveLength(1);
		expect(driveRefusalIn(log, "b")).toBe(
			"drive.foreign drive-1 belongs to workspace w",
		);
	});

	test("counts the persistent refusals in a row; a missing drive or a laid-out boot ends the run", () => {
		const foreign = (at: number, id: string) =>
			boot(at, id, `${at + 1} drive.foreign d belongs to workspace w`);
		const log = [
			boot(1, "a", "2 drive.layout ms=3", "3 host.exec 1.0"),
			foreign(10, "b"),
			boot(20, "c", "21 host.exec 1.0"),
			foreign(30, "d"),
		].join("\n");
		expect(persistentDriveRefusals(log)).toBe(3);
		expect(
			persistentDriveRefusals(
				`${log}\n${boot(40, "e", "41 drive.missing d is not mounted")}`,
			),
		).toBe(0);
	});
});

describe("settleSandbox with a drive", () => {
	let health: unknown = null;
	let bootLog = "";
	stub(globalThis, {
		fetch: async (url: string) => {
			if (String(url).endsWith("/trpc/health.check") && health !== null) {
				return new Response(JSON.stringify(health));
			}
			if (String(url).endsWith("/trpc/sandbox.setEnvironment")) {
				return new Response("{}");
			}
			throw new Error("not answering");
		},
	});
	const box = {
		status: "running",
		readFileToBuffer: async () => Buffer.from(bootLog),
	} as never;
	const claim = {
		identity: { SUPERSET_SANDBOX_DRIVE: "drive-1" },
		hostSecret: "secret",
		managedEnv: {},
	} as never;
	const answering = (phases: string[]) => ({
		result: {
			data: {
				json: {
					sandboxBoot: {
						stamps: phases.map((phase, at) => ({ phase, at })),
					},
				},
			},
		},
	});

	test("a refused boot is a retryable not-ready, found without the full host wait", async () => {
		health = null;
		bootLog =
			"1 boot.start pid=1 boot=this\n2 drive.missing drive-1 is not mounted at /mnt/superset-drive\n";
		const started = Date.now();
		const error = await settleSandbox({
			providerSandboxId: "sbx",
			hostTarget: "https://box.invalid",
			claim,
			bootId: "this",
			getSession: async () => box,
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(SandboxDriveMissingError);
		expect(error).toBeInstanceOf(SandboxNotReadyError);
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	test("a refusal no remount can change ends the retries after several boots in a row", async () => {
		health = null;
		bootLog = Array.from(
			{ length: DRIVE_REFUSAL_LIMIT },
			(_, i) =>
				`${i * 10} boot.start pid=1 boot=b${i}\n${i * 10 + 1} drive.unlaid drive-1 carries no workspace id`,
		).join("\n");
		const error = await settleSandbox({
			providerSandboxId: "sbx",
			hostTarget: "https://box.invalid",
			claim,
			bootId: `b${DRIVE_REFUSAL_LIMIT - 1}`,
			getSession: async () => box,
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(SandboxDriveRefusedError);
		expect(error).toBeInstanceOf(SandboxUnavailableError);
		expect(error).toMatchObject({ boots: DRIVE_REFUSAL_LIMIT });
		expect(String(error)).not.toContain("drive");
	});

	test("a boot that answers without laying the drive out fails the settle", async () => {
		health = answering(["boot.start", "host.ready"]);
		bootLog = "";
		await expect(
			settleSandbox({
				providerSandboxId: "sbx",
				hostTarget: "https://box.invalid",
				claim,
				getSession: async () => box,
			}),
		).rejects.toBeInstanceOf(SandboxDriveMissingError);
	});

	test("a boot that laid the drive out settles", async () => {
		health = answering(["boot.start", "drive.layout", "host.ready"]);
		bootLog = "";
		const answer = await settleSandbox({
			providerSandboxId: "sbx",
			hostTarget: "https://box.invalid",
			claim,
			getSession: async () => box,
		});
		expect(answer.stamps.map((stamp) => stamp.phase)).toContain("drive.layout");
	});
});

describe("promoteSandboxToEnvironment", () => {
	let events: string[];
	let created: Record<string, unknown> | null;
	let goldenStatus: string;
	let goldenSnapshot: string;
	let stripExit: number;
	const source = {
		status: "running",
		region: "iad1",
		vcpus: 4,
		currentSession: () => ({
			sessionId: "sess-source",
			snapshot: async () => {
				events.push("snapshot source");
				return { snapshotId: "snap-1" };
			},
		}),
	};
	const golden = {
		get status() {
			return goldenStatus;
		},
		get currentSnapshotId() {
			return goldenSnapshot;
		},
		runCommand: async (command: { args: string[] }) => {
			events.push(`strip ${command.args.join(" ")}`);
			return { exitCode: stripExit };
		},
		stop: async () => {
			goldenStatus = "stopped";
			goldenSnapshot = "snap-golden";
		},
	};
	stub(Sandbox, {
		get: async ({ name }: { name: string }) =>
			name === "ws-source" ? source : golden,
		create: async (params: Record<string, unknown>) => {
			created = params;
			return golden;
		},
	});
	const drives = {
		find: async (name: string) => {
			events.push(`find ${name}`);
			return { region: "iad1" };
		},
		create: async () => {},
		fork: async (from: string, to: string) => {
			events.push(`fork ${from} ${to}`);
		},
		remove: async () => {},
	};
	beforeEach(() => {
		events = [];
		created = null;
		goldenStatus = "running";
		goldenSnapshot = "snap-0";
		stripExit = 0;
	});

	test("a golden whose drive did not mount is not stripped and fails the promote", async () => {
		stripExit = 3;
		await expect(
			promoteSandboxToEnvironment({
				sourceSandbox: "ws-source",
				goldenName: "env-g",
				organizationId: "org_1",
				sourceDriveName: "drive-ws-source",
				drives,
			}),
		).rejects.toThrow(`${SANDBOX_PATHS.drive} is not mounted`);
		const strip = events.find((event) => event.startsWith("strip")) ?? "";
		expect(strip).toContain(`mountpoint -q ${SANDBOX_PATHS.drive} || exit 3;`);
	});

	test("forks the source's drive once it is released, strips identity on the drive, and leaves the source's restart to the caller", async () => {
		const result = await promoteSandboxToEnvironment({
			sourceSandbox: "ws-source",
			goldenName: "env-g",
			organizationId: "org_1",
			sourceDriveName: "drive-ws-source",
			drives,
		});
		expect(result.goldenDriveName).toBe("env-drive-env-g");
		expect(created?.mounts).toEqual({
			[SANDBOX_PATHS.drive]: { drive: "env-drive-env-g", mode: "read-write" },
		});
		const strip = events.find((event) => event.startsWith("strip")) ?? "";
		expect(strip).toContain(`${SANDBOX_PATHS.drive}/workspace/.env`);
		expect(strip).toContain(`${SANDBOX_PATHS.drive}/home/.codex/sessions`);
		expect(strip).toContain(SANDBOX_PATHS.driveState);
		expect(events).toEqual([
			"snapshot source",
			"find drive-ws-source",
			"fork drive-ws-source env-drive-env-g",
			strip,
			"find env-drive-env-g",
		]);
		expect(result.stopped).toEqual({ sessionId: "sess-source" });
	});

	test("a source without a drive leaves the environment out of drive mode", async () => {
		const result = await promoteSandboxToEnvironment({
			sourceSandbox: "ws-source",
			goldenName: "env-g",
			organizationId: "org_1",
			drives,
		});
		expect(result.goldenDriveName).toBeNull();
		expect(created).not.toHaveProperty("mounts");
		expect(events.some((event) => event.startsWith("fork"))).toBe(false);
		expect(events.join("\n")).not.toContain(SANDBOX_PATHS.drive);
	});
});

describe("deleteSandboxAndDrive", () => {
	let events: string[];
	let status: string;
	let expired = false;
	stub(Sandbox, {
		get: async () => {
			if (expired) throw new APIError(new Response(null, { status: 410 }));
			return box();
		},
	});
	const box = () => ({
		get status() {
			return status;
		},
		currentSession: () => ({ sessionId: "s" }),
		stop: async () => {
			events.push("stop");
			status = "stopped";
		},
		delete: async () => {
			events.push("delete sandbox");
		},
	});
	const drives = {
		find: async () => {
			events.push("find");
			return { region: "iad1" };
		},
		create: async () => {},
		fork: async () => {},
		remove: async (name: string) => {
			events.push(`delete ${name}`);
		},
	};

	test("stops the box and waits for the drive before deleting either", async () => {
		events = [];
		status = "running";
		await deleteSandboxAndDrive("ws-1", "drive-ws-1", drives);
		expect(events).toEqual([
			"stop",
			"find",
			"delete sandbox",
			"delete drive-ws-1",
		]);
	});

	test("a box whose snapshot expired, which cannot be fetched, still lets its drive go", async () => {
		events = [];
		expired = true;
		await deleteSandboxAndDrive("ws-1", "drive-ws-1", drives);
		expired = false;
		expect(events).toEqual(["find", "delete drive-ws-1"]);
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

describe("wakeSandbox", () => {
	const asked: string[] = [];
	const updates: unknown[] = [];
	stub(Sandbox, {
		get: async () => ({
			status: "stopped",
			region: "iad1",
			vcpus: 2,
			mounts: {},
			domain: () => "https://host.example",
			update: async (patch: unknown) => {
				updates.push(patch);
			},
		}),
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			asked.push(name);
			return { currentSandboxName: undefined };
		},
	});

	test("mounts the drive of the box's own region, not its environment's", async () => {
		const stop = new Error("stop before resume");
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim: {
					vcpus: 2,
					agentTools: true,
					identity: { SUPERSET_BUNDLE_SHA: "abcdef012345".repeat(5) },
				} as unknown as SandboxClaim,
				beforeResume: () => Promise.reject(stop),
			}),
		).rejects.toBe(stop);
		expect(asked).toEqual(["agent-tools-iad1-abcdef012345"]);
		expect(updates).toEqual([
			{
				mounts: {
					"/opt/agents": {
						drive: "agent-tools-iad1-abcdef012345",
						mode: "snapshot",
					},
				},
			},
		]);
	});
});
