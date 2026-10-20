import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { DiscoverSessionsResult } from "@superset/chat/protocol";
import type {
	DiscoverNativeSessionsInput,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../harness";
import type { ChatRuntime } from "../../index";
import type { HarnessFactory, HarnessRegistry } from "../../sessions";
import { createTestRuntime } from "../../testing/testRuntime";

const HARNESS = "listing";

type Probe = {
	started: number;
	disposed: number;
	queries: DiscoverNativeSessionsInput[];
	factoryCalls: number;
};

function listingAdapter(
	probe: Probe,
	page: DiscoverSessionsResult | Error,
): HarnessAdapter {
	probe.factoryCalls += 1;
	return {
		start(options: HarnessStartOptions): AsyncIterable<never> {
			probe.started += 1;
			void options;
			return (async function* () {})();
		},
		prompt() {},
		cancelTurn() {},
		respondToApproval() {},
		setMode() {},
		discoverSessions(input) {
			probe.queries.push(input);
			if (page instanceof Error) return Promise.reject(page);
			return Promise.resolve(page);
		},
		dispose() {
			probe.disposed += 1;
			return Promise.resolve();
		},
	};
}

function runtimeOf(factory: HarnessFactory): {
	runtime: ChatRuntime;
	probe: Probe;
} {
	const probe: Probe = {
		started: 0,
		disposed: 0,
		queries: [],
		factoryCalls: 0,
	};
	const harnesses: HarnessRegistry = new Map([[HARNESS, factory]]);
	return { runtime: createTestRuntime({ harnesses }), probe };
}

describe("discoverSessions", () => {
	test("returns unsupported without starting a session when the harness cannot list", async () => {
		const probe: Probe = {
			started: 0,
			disposed: 0,
			queries: [],
			factoryCalls: 0,
		};
		const harnesses: HarnessRegistry = new Map([
			[
				HARNESS,
				() => {
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
						dispose() {
							probe.disposed += 1;
							return Promise.resolve();
						},
					};
				},
			],
		]);
		const runtime = createTestRuntime({ harnesses });

		await expect(
			runtime.commands.discoverSessions({
				scopeId: "workspace-1",
				harness: HARNESS,
				cwd: "/work/repo",
			}),
		).resolves.toEqual({ supported: false, sessions: [] });
		expect(probe).toMatchObject({
			factoryCalls: 1,
			started: 0,
			disposed: 1,
		});
		expect(runtime.sessions.list()).toEqual([]);
		await runtime.dispose();
	});

	test("lists through a temporary adapter, then disposes it", async () => {
		const probe: Probe = {
			started: 0,
			disposed: 0,
			queries: [],
			factoryCalls: 0,
		};
		const { runtime } = runtimeOf(() =>
			listingAdapter(probe, {
				supported: true,
				sessions: [
					{
						sessionId: "native-1",
						cwd: "/work/repo",
						title: "Fix the flaky test",
					},
				],
				nextCursor: "page-2",
			}),
		);

		await expect(
			runtime.commands.discoverSessions({
				scopeId: "workspace-1",
				harness: HARNESS,
				cwd: "/work/repo",
				cursor: "page-1",
			}),
		).resolves.toEqual({
			supported: true,
			sessions: [
				{
					sessionId: "native-1",
					cwd: "/work/repo",
					title: "Fix the flaky test",
				},
			],
			nextCursor: "page-2",
		});
		expect(probe.queries).toEqual([{ cwd: "/work/repo", cursor: "page-1" }]);
		expect(probe.started).toBe(0);
		expect(probe.disposed).toBe(1);
		expect(runtime.sessions.list()).toEqual([]);
		await runtime.dispose();
	});

	test("reuses a live adapter and does not spawn another", async () => {
		const probe: Probe = {
			started: 0,
			disposed: 0,
			queries: [],
			factoryCalls: 0,
		};
		const { runtime } = runtimeOf(() =>
			listingAdapter(probe, { supported: true, sessions: [] }),
		);
		runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: HARNESS,
			cwd: "/work/repo",
		});

		await runtime.commands.discoverSessions({
			scopeId: "workspace-1",
			harness: HARNESS,
			cwd: "/work/repo",
		});
		await runtime.commands.discoverSessions({
			scopeId: "workspace-2",
			harness: HARNESS,
			cwd: "/other",
			cursor: "older",
		});

		expect(probe.factoryCalls).toBe(2);
		expect(probe.started).toBe(1);
		expect(probe.queries).toEqual([
			{ cwd: "/work/repo" },
			{ cwd: "/other", cursor: "older" },
		]);
		expect(probe.disposed).toBe(1);
		await runtime.dispose();
		expect(probe.disposed).toBe(2);
	});

	test("propagates a list failure after disposing the temporary adapter", async () => {
		const probe: Probe = {
			started: 0,
			disposed: 0,
			queries: [],
			factoryCalls: 0,
		};
		const { runtime } = runtimeOf(() =>
			listingAdapter(probe, new Error("history unreadable")),
		);

		await expect(
			runtime.commands.discoverSessions({
				scopeId: "workspace-1",
				harness: HARNESS,
				cwd: "/work/repo",
			}),
		).rejects.toThrow("history unreadable");
		expect(probe.disposed).toBe(1);
		expect(probe.started).toBe(0);
		await runtime.dispose();
	});

	test("rejects an unknown harness without opening a session", async () => {
		const runtime = createTestRuntime();
		await expect(
			runtime.commands.discoverSessions({
				scopeId: "workspace-1",
				harness: "nope",
				cwd: "/work/repo",
			}),
		).rejects.toThrow("unknown harness nope");
		expect(runtime.sessions.list()).toEqual([]);
		await runtime.dispose();
	});
});
