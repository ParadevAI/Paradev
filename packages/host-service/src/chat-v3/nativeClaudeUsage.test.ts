import { expect, mock, test } from "bun:test";

mock.module("../trpc/router/usage/claude", () => ({
	captureNativeClaudeUsageGeneration: async () => null,
	resolveNativeClaudeUsageScope: async () => null,
}));
mock.module("../trpc/router/usage/session-account/session-account", () => ({
	validateSessionAccount: async () => true,
}));
const { createNativeClaudeChatFeed } = await import("./nativeClaudeUsage");
const { createNativeClaudeUsageStore } = await import(
	"../trpc/router/usage/native-claude-usage"
);

import type { NativeClaudeUsageDependencies } from "../trpc/router/usage/native-claude-binding";

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
	const feed = createNativeClaudeChatFeed(deps, () => now);
	const event = (
		responseCounter: number,
		used = 0.2,
		sessionId = "owned-session",
	) => ({
		sessionId,
		responseCounter,
		rateLimitInfo: {
			rateLimitType: "five_hour",
			utilization: used,
			resetsAt: 1_800_000_300,
		},
	});
	return {
		feed,
		account,
		store,
		deps,
		event,
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
	};
}
test("ACP first restored event is not fresh; later actual response and cold promotion preserve age", async () => {
	const f = fixture();
	await f.feed.launched(f.account);
	f.feed.session("owned-session");
	await f.feed.settled();
	f.feed.event(f.event(0));
	await f.feed.settled();
	f.advance();
	f.feed.event(f.event(1, 0.25));
	await f.feed.settled();
	expect(f.store.snapshot("b".repeat(64))).toEqual([]);
	f.advance();
	f.warm();
	f.feed.event(f.event(1, 0.25));
	await f.feed.settled();
	expect(f.store.snapshot("b".repeat(64))[0]?.observedAt).toBe(
		1_800_000_001_000,
	);
	f.advance();
	f.feed.event(f.event(1, 0.25));
	await f.feed.settled();
	expect(f.store.snapshot("b".repeat(64))[0]?.observedAt).toBe(
		1_800_000_001_000,
	);
});
test("pre-spawn generation, foreign session, disposal and unpinned account guards hold", async () => {
	const f = fixture();
	await f.feed.launched(f.account);
	f.rotate();
	f.feed.session("owned-session");
	await f.feed.settled();
	f.warm();
	f.feed.event(f.event(1));
	await f.feed.settled();
	expect(f.store.snapshot("b".repeat(64))).toEqual([]);
	const other = fixture();
	other.warm();
	await other.feed.launched(other.account);
	other.feed.session("owned-session");
	await other.feed.settled();
	other.feed.event(other.event(1, 0.3, "foreign"));
	await other.feed.settled();
	expect(other.store.snapshot("b".repeat(64))).toEqual([]);
	other.feed.dispose();
	other.feed.event(other.event(1));
	await other.feed.settled();
	expect(other.store.snapshot("b".repeat(64))).toEqual([]);
	const unpinned = fixture();
	unpinned.warm();
	await unpinned.feed.launched({ ...unpinned.account, pinned: undefined });
	unpinned.feed.session("owned-session");
	unpinned.feed.event(unpinned.event(1));
	await unpinned.feed.settled();
	expect(unpinned.store.snapshot("b".repeat(64))).toEqual([]);
});

test("ACP events retain arrival time while queued behind asynchronous validation", async () => {
	const f = fixture();
	f.warm();
	await f.feed.launched(f.account);
	f.feed.session("owned-session");
	await f.feed.settled();
	let release!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let block = true;
	f.deps.validateAccount = async () => {
		if (block) {
			block = false;
			entered();
			await gate;
		}
		return true;
	};
	f.advance();
	f.feed.event(f.event(1, 0.25));
	await waiting;
	f.advance(2000);
	const receivedAt = f.time();
	f.feed.event(f.event(2, 0.4));
	f.advance(45_000);
	release();
	await f.feed.settled();
	const window = f.store.snapshot("b".repeat(64))[0];
	expect(window?.usedPercent).toBe(40);
	expect(window?.observedAt).toBe(receivedAt);
	expect(window?.observedAt).not.toBe(f.time());
});
