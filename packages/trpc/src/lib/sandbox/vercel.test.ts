import {
	afterAll,
	beforeAll,
	beforeEach,
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
	let updates: Array<Record<string, unknown>>;
	stub(Sandbox, {
		get: async () => ({
			get status() {
				return status;
			},
			vcpus: 4,
			domain: () => "https://box.invalid",
			update: async (params: Record<string, unknown>) => {
				updates.push(params);
			},
			extendTimeout: async () => {},
			writeFiles: async () => {
				throw RESUMED;
			},
		}),
	});
	stub(globalThis, {
		fetch: async () => {
			throw new Error("no network in tests");
		},
	});
	const mounts = { "/mnt/drive": { drive: "drive-1", mode: "read-write" } };
	const claim = { vcpus: 4, files: [], networkPolicy: {} } as never;
	const stopAtResume = async () => {
		throw RESUMED;
	};

	beforeEach(() => {
		updates = [];
	});

	test("a stopped box gets its mounts before it resumes", async () => {
		status = "stopped";
		await expect(
			wakeSandbox({
				providerSandboxId: "sbx",
				claim,
				mounts: mounts as never,
				beforeResume: stopAtResume,
			}),
		).rejects.toBe(RESUMED);
		expect(updates).toEqual([{ mounts }]);
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
