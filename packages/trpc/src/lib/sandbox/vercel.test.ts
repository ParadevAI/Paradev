import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import { spawnSync } from "node:child_process";
import { Sandbox } from "@vercel/sandbox";
import { stub } from "../../../test/stub";
import {
	findSandboxSession,
	listActiveWorkspaceSandboxes,
	SESSION_TIMEOUT_MS,
	stripWorkspaceIdentity,
	topUpSandboxSession,
	zeroFreeSpace,
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

type RunCommandArgs = { cmd: string; args: string[]; sudo?: boolean };

function recordingSandbox(answer: () => Promise<{ exitCode: number }>) {
	const calls: RunCommandArgs[] = [];
	const sandbox = {
		runCommand: async (params: RunCommandArgs) => {
			calls.push(params);
			return answer();
		},
	} as unknown as Sandbox;
	return { sandbox, calls };
}

describe("stripWorkspaceIdentity", () => {
	test("removes memguard's swapfiles so a golden does not carry them", async () => {
		const { sandbox, calls } = recordingSandbox(async () => ({ exitCode: 0 }));
		await stripWorkspaceIdentity(sandbox);
		expect(calls[0]?.args).toContain("/var/swap");
	});
});

describe("zeroFreeSpace", () => {
	async function scriptOf(): Promise<string> {
		const { sandbox, calls } = recordingSandbox(async () => ({ exitCode: 0 }));
		await zeroFreeSpace(sandbox);
		expect(calls[0]).toMatchObject({ cmd: "bash", sudo: true });
		return calls[0]?.args[1] ?? "";
	}

	function runWithFakes(script: string, ddExit: number) {
		const fakes = [
			"df() { echo Avail; echo 3221225472; }",
			'timeout() { shift; "$@"; }',
			`dd() { echo "dd $*"; return ${ddExit}; }`,
			'rm() { echo "rm $*"; }',
			"sync() { echo sync; }",
		].join("; ");
		return spawnSync("bash", ["-c", `${fakes}; ${script}`], {
			encoding: "utf8",
		});
	}

	test("fills all but 1 GiB of free space with zeros, then removes the file", async () => {
		const result = runWithFakes(await scriptOf(), 0);
		const lines = result.stdout.trim().split("\n");
		expect(lines[0]).toContain("if=/dev/zero");
		expect(lines[0]).toContain("bs=1M count=2048 conv=fsync");
		expect(lines.slice(1)).toEqual(["rm -f /superset-zero-fill", "sync"]);
		expect(result.status).toBe(0);
	});

	test("removes the file and reports the exit when the fill is cut short", async () => {
		const result = runWithFakes(await scriptOf(), 124);
		expect(result.stdout).toContain("rm -f /superset-zero-fill");
		expect(result.status).toBe(124);
	});

	test("a failed fill does not fail the caller", async () => {
		const { sandbox } = recordingSandbox(async () => {
			throw new Error("aborted");
		});
		await expect(zeroFreeSpace(sandbox)).resolves.toBeUndefined();
	});
});
