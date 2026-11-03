import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { DiscoverSessionsResult } from "@superset/chat/protocol";
import type {
	DiscoverNativeSessionsInput,
	HarnessAdapter,
} from "../../harness";
import { createTestRuntime } from "../../testing/testRuntime";
import { pathKey } from "./commands";

const HARNESS = "listing";

function probedRuntime(page: DiscoverSessionsResult | Error | null) {
	const probe = {
		started: 0,
		disposed: 0,
		factoryCalls: 0,
		queries: [] as DiscoverNativeSessionsInput[],
	};
	const adapter = (): HarnessAdapter => {
		probe.factoryCalls += 1;
		return {
			start(): AsyncIterable<never> {
				probe.started += 1;
				return (async function* () {})();
			},
			prompt() {},
			cancelTurn() {},
			respondToApproval() {},
			setMode() {},
			...(page === null
				? {}
				: {
						discoverSessions(input: DiscoverNativeSessionsInput) {
							probe.queries.push(input);
							return page instanceof Error
								? Promise.reject(page)
								: Promise.resolve(page);
						},
					}),
			dispose() {
				probe.disposed += 1;
				return Promise.resolve();
			},
		};
	};
	const runtime = createTestRuntime({
		harnesses: new Map([[HARNESS, adapter]]),
	});
	return { runtime, probe };
}

const query = { scopeId: "workspace-1", harness: HARNESS, cwd: "/work/repo" };

describe("discoverSessions", () => {
	test("lists through a temporary adapter that is never started and is always disposed", async () => {
		const page = { supported: true, sessions: [], nextCursor: "page-2" };
		for (const [result, expectation] of [
			[page, (p: Promise<unknown>) => expect(p).resolves.toEqual(page)],
			[
				null,
				(p: Promise<unknown>) =>
					expect(p).resolves.toEqual({ supported: false, sessions: [] }),
			],
			[
				new Error("history unreadable"),
				(p: Promise<unknown>) =>
					expect(p).rejects.toThrow("history unreadable"),
			],
		] as const) {
			const { runtime, probe } = probedRuntime(result);
			await expectation(runtime.commands.discoverSessions(query));
			expect(probe).toMatchObject({ started: 0, disposed: 1 });
			expect(runtime.sessions.list()).toEqual([]);
			await runtime.dispose();
		}
	});

	test("drops sessions from other worktrees of the same repository", async () => {
		const { runtime } = probedRuntime({
			supported: true,
			sessions: [
				{ sessionId: "here", cwd: "/work/repo" },
				{ sessionId: "here-trailing-slash", cwd: "/work/repo/" },
				{ sessionId: "sibling", cwd: "/work/repo-feature" },
			],
			nextCursor: "page-2",
		});

		const page = await runtime.commands.discoverSessions(query);

		expect(page.sessions.map((session) => session.sessionId)).toEqual([
			"here",
			"here-trailing-slash",
		]);
		expect(page.nextCursor).toBe("page-2");
		await runtime.dispose();
	});

	test("reuses a live adapter in the same scope only", async () => {
		const { runtime, probe } = probedRuntime({ supported: true, sessions: [] });
		runtime.commands.createSession({ commandId: randomUUID(), ...query });

		await runtime.commands.discoverSessions(query);
		await runtime.commands.discoverSessions({
			...query,
			scopeId: "workspace-2",
			cursor: "older",
		});

		expect(probe.factoryCalls).toBe(2);
		expect(probe.started).toBe(1);
		expect(probe.queries).toEqual([
			{ cwd: "/work/repo" },
			{ cwd: "/work/repo", cursor: "older" },
		]);
		expect(probe.disposed).toBe(1);
		await runtime.dispose();
	});

	test("matches Windows paths regardless of case", () => {
		expect(pathKey("c:\\Src\\Repo\\", "win32")).toBe(
			pathKey("C:\\src\\repo", "win32"),
		);
		expect(pathKey("/work/Repo", "linux")).not.toBe(
			pathKey("/work/repo", "linux"),
		);
	});
});
