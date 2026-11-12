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

function fakeHost(
	importSession: (input: { harnessSessionId: string }) => void,
) {
	const released: string[][] = [];
	const host = {
		teleport: {
			importTerminalSession: {
				mutate: async (input: { harnessSessionId: string }) => {
					importSession(input);
					return { terminalId: "new", label: "Claude Code" };
				},
			},
			releaseTerminals: {
				mutate: async (input: { terminalIds: string[] }) => {
					released.push(input.terminalIds);
					return { resumedTerminalIds: [] };
				},
			},
		},
	} as unknown as Parameters<typeof handOffTerminals>[0]["source"];
	return { host, released };
}

const resolveUrls = async (fileIds: string[]) =>
	fileIds.map((fileId) => ({ fileId, url: `https://r2.test/${fileId}` }));

describe("handOffTerminals", () => {
	test("a terminal that does not arrive starts again at the source", async () => {
		const imported: string[] = [];
		const destination = fakeHost(({ harnessSessionId }) => {
			if (harnessSessionId === "session-b") throw new Error("disk full");
			imported.push(harnessSessionId);
		});
		const source = fakeHost(() => {});

		const stayed = await handOffTerminals({
			terminals: [terminal("a"), terminal("b")],
			source: source.host,
			sourceWorkspaceId: "from",
			toWorkspaceId: "to",
			connect: async () => destination.host,
			resolveUrls,
		});

		expect(imported).toEqual(["session-a"]);
		expect(source.released).toEqual([["b"]]);
		expect(stayed).toEqual(["Claude b"]);
	});

	test("waits for a destination that is still starting", async () => {
		const destination = fakeHost(() => {});
		const source = fakeHost(() => {});
		let calls = 0;

		const stayed = await handOffTerminals({
			terminals: [terminal("a")],
			source: source.host,
			sourceWorkspaceId: "from",
			toWorkspaceId: "to",
			connect: async () => {
				calls += 1;
				if (calls < 3) throw new Error("Workspace is provisioning");
				return destination.host;
			},
			resolveUrls,
			attempts: 5,
			sleep: async () => {},
		});

		expect(calls).toBe(3);
		expect(stayed).toEqual([]);
		expect(source.released).toEqual([]);
	});
});
