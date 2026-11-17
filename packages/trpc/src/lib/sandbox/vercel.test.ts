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
import { Drive, Sandbox } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	agentToolsMounts,
	bootRefusedForMissingDrive,
	composeMounts,
	deleteSandboxAndDrive,
	findSandboxSession,
	listActiveWorkspaceSandboxes,
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
	stub(Sandbox, {
		get: async () => ({
			get status() {
				return status;
			},
			get mounts() {
				return current;
			},
			vcpus: 4,
			domain: () => "https://box.invalid",
			update: async (params: Record<string, unknown>) => {
				events.push("update");
				updates.push(params);
			},
			extendTimeout: async () => {},
			writeFiles: async () => {
				throw RESUMED;
			},
		}),
	});
	stub(Drive, {
		get: async ({ name }: { name: string }) => {
			events.push(`drive:${name}`);
			return { name, currentSandboxName: undefined };
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
	const stopAtResume = async () => {
		events.push("resume");
		throw RESUMED;
	};

	beforeEach(() => {
		current = {};
		events = [];
		updates = [];
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
				claim: { ...(claim as object), agentToolsDrive: agents } as never,
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
				claim: {
					...(claim as object),
					agentToolsDrive: "agent-tools-iad1-feedfacecafe",
				} as never,
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

describe("composeMounts", () => {
	test("merges parts, a later part winning a shared path, and drops empty", () => {
		const a = { "/a": { drive: "a", mode: "read-write" as const } };
		const b = { "/a": { drive: "b", mode: "snapshot" as const } };
		expect(composeMounts(a, undefined, b)).toEqual(b);
		expect(composeMounts(undefined, {})).toBeUndefined();
	});
});

describe("bootRefusedForMissingDrive", () => {
	test("reads only the last boot of the log", () => {
		const refused =
			"1 boot.start pid=1 bundle=abc\n2 run.cleared\n3 drive.missing drive-1 is not mounted at /mnt/superset-drive\n4 boot.refused x\n";
		const recovered = `${refused}5 boot.start pid=2 bundle=abc\n6 drive.layout ms=11\n`;
		expect(bootRefusedForMissingDrive(refused)).toBe(true);
		expect(bootRefusedForMissingDrive(recovered)).toBe(false);
		expect(bootRefusedForMissingDrive("")).toBe(false);
	});
});

describe("promoteSandboxToEnvironment", () => {
	let events: string[];
	let created: Record<string, unknown> | null;
	let goldenStatus: string;
	let goldenSnapshot: string;
	const source = {
		status: "running",
		region: "iad1",
		vcpus: 4,
		mounts: {},
		snapshot: async () => {
			events.push("snapshot source");
			return { snapshotId: "snap-1" };
		},
		update: async (params: Record<string, unknown>) => {
			events.push(`update source ${JSON.stringify(params.mounts)}`);
		},
		writeFiles: async () => {},
		runCommand: async () => {
			events.push("boot source");
		},
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
		},
		hostSecret: "s",
		files: [],
	} as never;

	beforeEach(() => {
		events = [];
		created = null;
		goldenStatus = "running";
		goldenSnapshot = "snap-0";
	});

	test("forks the source's drive once it is released and strips identity on the drive", async () => {
		const result = await promoteSandboxToEnvironment({
			sourceSandbox: "ws-source",
			goldenName: "env-g",
			claim,
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
		expect(events).toEqual([
			"snapshot source",
			"find drive-ws-source",
			"fork drive-ws-source env-drive-env-g",
			strip,
			"find env-drive-env-g",
			`update source ${JSON.stringify({ [SANDBOX_PATHS.drive]: { drive: "drive-ws-source", mode: "read-write" } })}`,
			"boot source",
		]);
	});

	test("a source without a drive leaves the environment out of drive mode", async () => {
		const result = await promoteSandboxToEnvironment({
			sourceSandbox: "ws-source",
			goldenName: "env-g",
			claim,
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
	stub(Sandbox, {
		get: async () => ({
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
		}),
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
