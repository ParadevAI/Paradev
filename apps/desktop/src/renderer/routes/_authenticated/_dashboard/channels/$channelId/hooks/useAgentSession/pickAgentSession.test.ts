import { describe, expect, test } from "bun:test";
import { pickAgentSession } from "./pickAgentSession";

const session = (
	sessionId: string,
	overrides: Partial<{
		harnessSessionId: string | null;
		title: string | null;
		live: boolean;
		status: string;
		updatedAt: number;
	}> = {},
) => ({
	sessionId,
	harnessSessionId: null,
	title: null,
	live: false,
	status: "idle",
	updatedAt: 1,
	...overrides,
});

describe("pickAgentSession", () => {
	test("a live session first, then the newest past starting", () => {
		expect(
			pickAgentSession(
				[
					session("old", { updatedAt: 1 }),
					session("new", { updatedAt: 5 }),
					session("booting", { status: "starting", updatedAt: 9 }),
				],
				new Set(),
			)?.sessionId,
		).toBe("new");
		expect(
			pickAgentSession(
				[session("new", { updatedAt: 5 }), session("live", { live: true })],
				new Set(),
			)?.sessionId,
		).toBe("live");
	});

	test("a session that had a real turn beats a newer empty one", () => {
		expect(
			pickAgentSession(
				[
					session("empty", { updatedAt: 9 }),
					session("talked", { title: "Current day answer", updatedAt: 2 }),
				],
				new Set(),
			)?.sessionId,
		).toBe("talked");
	});

	test("never another channel's coordinator in the same workspace, nor an earlier session of its conversation", () => {
		expect(
			pickAgentSession(
				[
					session("coordinator", { harnessSessionId: "h-c", updatedAt: 9 }),
					session("coordinator-before", {
						harnessSessionId: "h-c",
						updatedAt: 8,
					}),
					session("agent", { harnessSessionId: "h-a", updatedAt: 2 }),
				],
				new Set(["coordinator"]),
			)?.sessionId,
		).toBe("agent");
		expect(
			pickAgentSession([session("coordinator")], new Set(["coordinator"])),
		).toBeNull();
	});
});
