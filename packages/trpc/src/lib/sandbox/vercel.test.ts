import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import * as Sentry from "@sentry/core";
import { APIError, Drive, Sandbox } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	agentToolsDrive,
	applyClaimInPlace,
	CloudWorkspaceNotStartedError,
	deleteSandbox,
	describeSandbox,
	findSandboxSession,
	keepaliveWindowMs,
	listActiveWorkspaceSandboxes,
	listSandboxSessions,
	promoteSandboxToEnvironment,
	type SandboxClaim,
	SandboxNotReadyError,
	SandboxUnavailableError,
	SESSION_TIMEOUT_MS,
	sandboxExists,
	stopSandbox,
	topUpSandboxSession,
	WAKE_READY_DEADLINE_MS,
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
					.sort((a, b) => b.createdAt - a.createdAt)
			: [...sandboxes].sort((a, b) => b.statusUpdatedAt - a.statusUpdatedAt);
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
	const box: {
		live: typeof read;
		snapshotId: string | undefined;
		resumes: string[];
	} = { live: read, snapshotId: "snap_stop_0", resumes: [] };
	const stoppedError = () => new APIError(new Response(null, { status: 410 }));
	const session = {
		sessionId: "sess_A",
		vcpus: 4,
		update: async () => {
			if (box.live !== "running") throw stoppedError();
		},
		writeFiles: async () => {
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

	test("reads, stops, deletes, session lists, claim and top-up", async () => {
		fake = fakeBox("stopped");
		await describeSandbox("ws-box");
		await sandboxExists("ws-box");
		await stopSandbox("ws-box");
		await listSandboxSessions("ws-box", NOW - HOUR);
		await findSandboxSession("ws-box", null);
		expect(
			await applyClaimInPlace({
				providerSandboxId: "ws-box",
				claim: { networkPolicy: {}, managedEnv: {}, hostSecret: "s" },
			}),
		).toBe("not-running");
		expect(await topUpSandboxSession("ws-box")).toBeNull();
		await deleteSandbox("ws-box");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});

	test("claim and top-up find the box stopped since they read it running", async () => {
		fake = stopsAfterRead(fakeBox("running"));
		expect(
			await applyClaimInPlace({
				providerSandboxId: "ws-box",
				claim: { networkPolicy: {}, managedEnv: {}, hostSecret: "s" },
			}),
		).toBe("not-running");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });

		fake = stopsAfterRead(fakeBox("running"));
		expect(await topUpSandboxSession("ws-box", HOUR)).toBeNull();
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});

	test("a box that stops between the policy and its files is left stopped", async () => {
		fake = fakeBox("running");
		const session = (await fake.get()).currentSession();
		const update = session.update;
		session.update = async () => {
			await update();
			fake.stopNow();
		};
		expect(
			await applyClaimInPlace({
				providerSandboxId: "ws-box",
				claim: {
					networkPolicy: {},
					files: [{ path: "/a", content: "" }],
					managedEnv: {},
					hostSecret: "s",
				},
			}),
		).toBe("not-running");
		expect(fake.box).toMatchObject({ live: "stopped", resumes: [] });
	});
});

describe("promoteSandboxToEnvironment", () => {
	let fake = fakeBox("running");
	let sourceSnapshot: string | undefined;
	let createTags: unknown;
	const golden = {
		currentSnapshotId: "snap_golden_0",
		runCommand: async () => {},
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
	stub(Drive, { get: async () => ({ currentSandboxName: undefined }) });
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
	type Resumed = Parameters<
		NonNullable<Parameters<typeof wakeSandbox>[0]["beforeResume"]>
	>[0];
	async function wake(): Promise<Resumed[]> {
		const authorized: Resumed[] = [];
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

describe("keepaliveWindowMs", () => {
	test("outlives the box's next ping, and never exceeds what a legacy box gets", () => {
		expect(keepaliveWindowMs(5 * 60_000)).toBe(SESSION_TIMEOUT_MS);
		expect(keepaliveWindowMs()).toBe(20 * 60_000);
		expect(keepaliveWindowMs(24 * 60 * 60_000)).toBe(20 * 60_000);
	});
});

describe("agentToolsDrive", () => {
	const claim = (bundle: string) =>
		({
			identity: { SUPERSET_BUNDLE_SHA: bundle.repeat(64 / bundle.length) },
		}) as unknown as SandboxClaim;
	const reported: unknown[] = [];
	stub(Sentry, {
		captureException: (_: unknown, context: unknown) => {
			reported.push(context);
			return "";
		},
	});

	test("names the drive by region and bundle, and asks once while it stays usable", async () => {
		let asked = 0;
		const getDrive = async () => {
			asked++;
			return { currentSandboxName: undefined };
		};
		expect(await agentToolsDrive(claim("ab"), "iad1", getDrive)).toBe(
			"agent-tools-iad1-abababababab",
		);
		await agentToolsDrive(claim("ab"), "iad1", getDrive);
		expect(asked).toBe(1);
	});

	test("a missing or attached drive is the generic could-not-start, reported with the drive", async () => {
		reported.length = 0;
		await expect(
			agentToolsDrive(claim("cd"), "sfo1", () =>
				Promise.reject(new Error("404")),
			),
		).rejects.toBeInstanceOf(CloudWorkspaceNotStartedError);
		await expect(
			agentToolsDrive(claim("ef"), "sfo1", async () => ({
				currentSandboxName: "builder",
			})),
		).rejects.toBeInstanceOf(CloudWorkspaceNotStartedError);
		expect(reported).toEqual([
			{
				tags: { "sandbox.agent_tools_drive": "agent-tools-sfo1-cdcdcdcdcdcd" },
			},
			{
				tags: { "sandbox.agent_tools_drive": "agent-tools-sfo1-efefefefefef" },
			},
		]);
	});
});

describe("wakeSandbox", () => {
	const asked: string[] = [];
	const updates: unknown[] = [];
	let savedTimeout = SESSION_TIMEOUT_MS;
	let mountRefused = false;
	stub(Sandbox, {
		get: async () => ({
			status: "stopped",
			region: "iad1",
			vcpus: 2,
			timeout: savedTimeout,
			mounts: {},
			domain: () => "https://host.example",
			update: async (patch: { mounts?: unknown }) => {
				updates.push(patch);
				if (patch.mounts && mountRefused) throw new Error("502");
			},
		}),
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			asked.push(name);
			return { currentSandboxName: undefined };
		},
	});
	const stop = new Error("stop before resume");
	/** Rejects with `stop` once the box would resume. */
	const wakeUntilResume = () => {
		updates.length = 0;
		return wakeSandbox({
			providerSandboxId: "sbx",
			claim: {
				vcpus: 2,
				identity: { SUPERSET_BUNDLE_SHA: "abcdef012345".repeat(5) },
			} as unknown as SandboxClaim,
			beforeResume: () => Promise.reject(stop),
		});
	};

	test("mounts the drive of the box's own region, not its environment's", async () => {
		await expect(wakeUntilResume()).rejects.toBe(stop);
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

	test("gives a box created with an older timeout the current one before it resumes", async () => {
		savedTimeout = HOUR;
		await expect(wakeUntilResume()).rejects.toBe(stop);
		expect(updates[0]).toEqual({ timeout: SESSION_TIMEOUT_MS });
		savedTimeout = SESSION_TIMEOUT_MS;
	});

	test("a refused mounts update fails the wake as could-not-start before the box resumes", async () => {
		mountRefused = true;
		await expect(wakeUntilResume()).rejects.toBeInstanceOf(
			CloudWorkspaceNotStartedError,
		);
		mountRefused = false;
	});
});

test("a box that did not get ready names the boot phases it reached, with offsets", () => {
	const stamps = [
		{ phase: "boot.start", at: 1_000 },
		{ phase: "host.exec", at: 4_200 },
	];
	expect(new SandboxNotReadyError("ws-box", stamps).message).toBe(
		"host-service in ws-box did not answer in time; the boot reached boot.start +0ms, host.exec +3200ms",
	);
	expect(new SandboxNotReadyError("ws-box", null).message).toEndWith(
		"the boot reached an unreadable boot log",
	);
});

describe("a wake past its deadline", () => {
	const reports: unknown[] = [];
	stub(Sentry, {
		captureMessage: (message: string, context: unknown) => {
			reports.push([message, context]);
			return "";
		},
	});
	stub(Sandbox, {
		get: async () => ({
			status: "running",
			region: "iad1",
			vcpus: 8,
			timeout: SESSION_TIMEOUT_MS,
			expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
			domain: () => "https://slow.example",
			extendTimeout: async () => {},
			update: async () => {},
			writeFiles: async () => {},
			runCommand: async () => ({ exitCode: 0 }),
		}),
	});
	stub(globalThis, { fetch: async () => new Response("", { status: 503 }) });

	test("gives up when host-service has not answered, and reports the box once", async () => {
		let now = 0;
		const clock = {
			now: () => now,
			sleep: async (ms: number) => {
				now += ms;
			},
		};
		await expect(
			wakeSandbox({
				providerSandboxId: "ws-slow",
				claim: {
					vcpus: 8,
					hostSecret: "s",
					managedEnv: {},
					networkPolicy: "allow-all",
					identity: {
						SUPERSET_SANDBOX_CONTRACT: "1",
						SUPERSET_API_URL: "https://api.test",
						SUPERSET_SANDBOX_WORKSPACE_ID:
							"2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
						SUPERSET_SANDBOX_ORGANIZATION_ID:
							"1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
						SUPERSET_SANDBOX_REPOSITORIES: "[]",
						SUPERSET_SANDBOX_IMAGE_TAG: "image",
						SUPERSET_SANDBOX_PROVIDER: "vercel",
						SUPERSET_BUNDLE_SHA: "a".repeat(64),
					},
				} as never,
				clock,
			}),
		).rejects.toBeInstanceOf(CloudWorkspaceNotStartedError);
		expect(reports).toEqual([
			[
				"cloud workspace wake missed its deadline",
				{
					level: "error",
					tags: {
						"sandbox.box": "ws-slow",
						"sandbox.region": "iad1",
						"sandbox.vcpus": "8",
					},
					extra: { elapsedMs: WAKE_READY_DEADLINE_MS },
				},
			],
		]);
	});
});
