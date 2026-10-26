import { expect, test } from "bun:test";
import type { TerminalAgentBinding } from "../../../terminal-agents/types";
import type { NativeClaudeUsageDependencies } from "../usage/native-claude-binding";
import { createNativeClaudeUsageStore } from "../usage/native-claude-usage";
import {
	createNativeClaudeTerminalFeed,
	matchesNativeClaudeHook,
} from "./native-claude-usage";

function fixture() {
	let now = 1_800_000_000_000;
	let generation = "a".repeat(64);
	let scope: string | null = null;
	const account = {
		agent: "claude" as const,
		credentialKind: "subscription" as const,
		pinned: true as const,
		identity: "e".repeat(64),
		selection: "/fixture/profile",
		directory: "/fixture/profile",
	};
	const identity = {
		terminalId: "owned-terminal",
		launchId: "owned-launch",
		sessionId: "owned-session",
	};
	let binding: TerminalAgentBinding = {
		...identity,
		agentSessionId: identity.sessionId,
		account,
		workspaceId: "owned-workspace",
		agentId: "claude",
		startedAt: now,
		lastEventAt: now,
		lastEventType: "Attached",
	};
	const store = createNativeClaudeUsageStore({
		persist: false,
		now: () => now,
	});
	const deps: NativeClaudeUsageDependencies = {
		store,
		validateAccount: async () => true,
		captureGeneration: async () => generation,
		resolveScope: async (_a, _d, _i, expected) =>
			expected === generation ? scope : null,
	};
	const feed = createNativeClaudeTerminalFeed(deps, () => now);
	const frame = (counter: number) => ({
		cost: { total_api_duration_ms: counter },
		rate_limits: {
			five_hour: { used_percentage: 25, resets_at: 1_800_000_300 },
		},
	});
	return {
		account,
		identity,
		feed,
		store,
		deps,
		frame,
		current: () => binding,
		advance: (ms = 1000) => {
			now += ms;
		},
		time: () => now,
		warm: () => {
			scope = "b".repeat(64);
		},
		rotate: () => {
			generation = "c".repeat(64);
		},
		replace: (change: Partial<TerminalAgentBinding>) => {
			binding = { ...binding, ...change };
		},
	};
}
test("prelaunch generation survives cold proof and promotes later replay at its original age", async () => {
	const f = fixture();
	expect(await f.feed.prepare(f.identity.terminalId, f.account)).toBe(true);
	expect(f.feed.capture(f.identity, f.current)).toBe(true);
	expect(await f.feed.ingest(f.identity, f.frame(0), f.current)).toBe(false);
	f.advance();
	await f.feed.ingest(f.identity, f.frame(1), f.current);
	f.advance();
	f.warm();
	expect(await f.feed.ingest(f.identity, f.frame(1), f.current)).toBe(true);
	expect(f.store.snapshot("b".repeat(64))[0]?.observedAt).toBe(
		1_800_000_001_000,
	);
});
test("unprepared, changed generation, ended and foreign sessions cannot bind", async () => {
	const f = fixture();
	expect(f.feed.capture(f.identity, f.current)).toBe(false);
	await f.feed.prepare(f.identity.terminalId, f.account);
	expect(
		f.feed.capture({ ...f.identity, sessionId: "foreign" }, f.current),
	).toBe(false);
	expect(f.feed.capture(f.identity, f.current)).toBe(true);
	f.warm();
	f.rotate();
	expect(await f.feed.ingest(f.identity, f.frame(1), f.current)).toBe(false);
	f.replace({ endedAt: 1_800_000_002_000 });
	expect(matchesNativeClaudeHook(f.current(), f.identity)).toBe(false);
});
test("a delayed hook cannot capture a credential rotated after prelaunch", async () => {
	const f = fixture();
	await f.feed.prepare(f.identity.terminalId, f.account);
	f.rotate();
	f.warm();
	expect(f.feed.capture(f.identity, f.current)).toBe(true);
	expect(await f.feed.ingest(f.identity, f.frame(0), f.current)).toBe(false);
	expect(await f.feed.ingest(f.identity, f.frame(1), f.current)).toBe(false);
	expect(f.store.snapshot("b".repeat(64))).toEqual([]);
});

test("background adoption never forwards predecessor samples or refreshes their age", async () => {
	const f = fixture();
	f.warm();
	await f.feed.prepare(f.identity.terminalId, f.account);
	f.feed.capture(f.identity, f.current);
	await f.feed.ingest(f.identity, f.frame(0), f.current);
	f.advance();
	await f.feed.ingest(f.identity, f.frame(1), f.current);
	const original = f.store.snapshot("b".repeat(64));
	f.advance();
	f.replace({ endedAt: 1_800_000_002_000, endReason: "resumed" });
	expect(await f.feed.ingest(f.identity, f.frame(2), f.current)).toBe(false);
	expect(f.store.snapshot("b".repeat(64))).toEqual(original);
	f.replace({
		terminalId: "successor-terminal",
		endedAt: undefined,
		endReason: undefined,
		launchId: "successor-launch",
	});
	expect(await f.feed.ingest(f.identity, f.frame(2), f.current)).toBe(false);
	expect(
		await f.feed.ingest(
			{
				...f.identity,
				terminalId: "successor-terminal",
				launchId: "successor-launch",
			},
			f.frame(2),
			f.current,
		),
	).toBe(false);
	expect(f.store.snapshot("b".repeat(64))).toEqual(original);
});

test("terminal hook receipt precedes deferred account validation", async () => {
	const f = fixture();
	f.warm();
	await f.feed.prepare(f.identity.terminalId, f.account);
	f.feed.capture(f.identity, f.current);
	await f.feed.ingest(f.identity, f.frame(0), f.current);
	f.advance();
	const receivedAt = f.time();
	let release!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.deps.validateAccount = async () => {
		entered();
		await gate;
		return true;
	};
	const pending = f.feed.ingest(f.identity, f.frame(1), f.current);
	await waiting;
	f.advance(45_000);
	release();
	expect(await pending).toBe(true);
	expect(f.store.snapshot("b".repeat(64))[0]?.observedAt).toBe(receivedAt);
});

test("a warm credential proof without a host launch permit cannot accept producer frames", async () => {
	const f = fixture();
	f.warm();
	expect(f.feed.capture(f.identity, f.current)).toBe(false);
	expect(await f.feed.ingest(f.identity, f.frame(0), f.current)).toBe(false);
	f.advance();
	expect(await f.feed.ingest(f.identity, f.frame(1), f.current)).toBe(false);
	expect(f.store.snapshot("b".repeat(64))).toEqual([]);
});
