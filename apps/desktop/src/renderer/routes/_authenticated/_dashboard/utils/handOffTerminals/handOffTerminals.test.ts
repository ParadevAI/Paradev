import { describe, expect, test } from "bun:test";
import { handOffTerminals, type MovingTerminal } from "./handOffTerminals";

function terminal(id: string): MovingTerminal {
	return {
		terminalId: id,
		agent: "claude",
		agentId: "claude",
		harnessSessionId: `session-${id}`,
		title: `Claude ${id}`,
		bundle: { fileId: `file-${id}`, sha256: "abc", byteLength: 10 },
	};
}

function refusal(code: string) {
	return Object.assign(new Error(code), { data: { code } });
}

function fakeHost({
	importSession = () => {},
	failedRelease = () => [] as string[],
}: {
	importSession?: (input: { harnessSessionId: string }) => void;
	failedRelease?: (ids: string[]) => string[];
} = {}) {
	const released: string[][] = [];
	const imports: string[] = [];
	const host = {
		teleport: {
			importTerminalSession: {
				mutate: async (input: { harnessSessionId: string }) => {
					imports.push(input.harnessSessionId);
					importSession(input);
					return { terminalId: "new", label: "Claude Code" };
				},
			},
			releaseTerminals: {
				mutate: async (input: { terminalIds: string[] }) => {
					released.push(input.terminalIds);
					return {
						resumedTerminalIds: [],
						failedTerminalIds: failedRelease(input.terminalIds),
					};
				},
			},
		},
	} as unknown as Parameters<typeof handOffTerminals>[0]["source"];
	return { host, released, imports };
}

const resolveUrls = async (fileIds: string[]) =>
	fileIds.map((fileId) => ({ fileId, url: `https://r2.test/${fileId}` }));
const base = { sourceWorkspaceId: "from", toWorkspaceId: "to", resolveUrls };

describe("handOffTerminals", () => {
	test("a terminal that does not arrive starts again at the source", async () => {
		const destination = fakeHost({
			importSession: ({ harnessSessionId }) => {
				if (harnessSessionId === "session-b")
					throw refusal("PRECONDITION_FAILED");
			},
		});
		const source = fakeHost();

		const result = await handOffTerminals({
			...base,
			terminals: [terminal("a"), terminal("b")],
			source: source.host,
			connect: async () => destination.host,
		});

		expect(destination.imports).toEqual(["session-a", "session-b"]);
		expect(source.released).toEqual([["b"]]);
		expect(result).toEqual({ stayed: ["Claude b"], notRestarted: [] });
	});

	test("waits for a destination that is still starting", async () => {
		const destination = fakeHost();
		const source = fakeHost();
		let calls = 0;

		const result = await handOffTerminals({
			...base,
			terminals: [terminal("a")],
			source: source.host,
			connect: async () => {
				calls += 1;
				if (calls < 3) throw new Error("Workspace is provisioning");
				return destination.host;
			},
			attempts: 5,
			sleep: async () => {},
		});

		expect(calls).toBe(3);
		expect(result).toEqual({ stayed: [], notRestarted: [] });
		expect(source.released).toEqual([]);
	});

	test("does not keep retrying an answer that will not change", async () => {
		const destination = fakeHost({
			importSession: () => {
				throw refusal("PRECONDITION_FAILED");
			},
		});
		const source = fakeHost();
		let slept = 0;

		await handOffTerminals({
			...base,
			terminals: [terminal("a")],
			source: source.host,
			connect: async () => destination.host,
			attempts: 5,
			sleep: async () => {
				slept += 1;
			},
		});

		expect(destination.imports).toEqual(["session-a"]);
		expect(slept).toBe(0);
		expect(source.released).toEqual([["a"]]);
	});

	test("names a terminal whose source restart did not happen", async () => {
		const destination = fakeHost({
			importSession: () => {
				throw refusal("PRECONDITION_FAILED");
			},
		});
		const source = fakeHost({
			failedRelease: (ids) => ids.filter((id) => id === "b"),
		});

		const result = await handOffTerminals({
			...base,
			terminals: [terminal("a"), terminal("b")],
			source: source.host,
			connect: async () => destination.host,
		});

		expect(result).toEqual({
			stayed: ["Claude a"],
			notRestarted: ["Claude b"],
		});
	});
});
