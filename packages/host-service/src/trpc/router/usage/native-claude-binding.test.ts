import { expect, test } from "bun:test";
import {
	ingestNativeClaudeBinding,
	type NativeClaudeAccount,
	type NativeClaudeUsageDependencies,
} from "./native-claude-binding";
import { createNativeClaudeUsageStore } from "./native-claude-usage";

function fixture() {
	let now = 1_800_000_000_000;
	let generation = "a".repeat(64);
	let scope: string | null = null;
	let valid = true;
	const store = createNativeClaudeUsageStore({
		persist: false,
		now: () => now,
	});
	const account: NativeClaudeAccount = {
		agent: "claude",
		credentialKind: "subscription",
		pinned: true,
		selection: "/fixture/profile",
		directory: "/fixture/profile",
		identity: "e".repeat(64),
	};
	const launch = { launchId: "owned-launch", sessionId: "owned-session" };
	const deps: NativeClaudeUsageDependencies = {
		store,
		validateAccount: async () => valid,
		captureGeneration: async () => generation,
		resolveScope: async (_selection, _directory, _identity, expected) =>
			expected === generation ? scope : null,
	};
	store.captureLaunch({ ...launch, generation });
	const frame = (counter: number, used = 10) => ({
		cost: { total_api_duration_ms: counter },
		rate_limits: {
			five_hour: {
				used_percentage: used,
				resets_at: (1_800_000_000_000 + 300_000) / 1000,
			},
		},
	});
	const ingest = (counter: number, used = 10) =>
		ingestNativeClaudeBinding(
			account,
			launch,
			{
				source: "claude_statusline",
				payload: frame(counter, used),
				receivedAt: now,
			},
			() => true,
			deps,
		);
	return {
		store,
		account,
		launch,
		deps,
		frame,
		ingest,
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
		invalidate: () => {
			valid = false;
		},
		scope: "b".repeat(64),
	};
}
test("cold launch warms on a later natural replay without promoting measurement age", async () => {
	const f = fixture();
	expect(await f.ingest(0)).toBe(false);
	f.advance();
	expect(await f.ingest(10, 20)).toBe(false);
	const measuredAt = f.time();
	expect(f.store.snapshot(f.scope)).toEqual([]);
	f.advance();
	f.warm();
	expect(await f.ingest(10, 20)).toBe(true);
	expect(f.store.snapshot(f.scope)).toEqual([
		{
			id: "five_hour",
			usedPercent: 20,
			resetsAt: 1_800_000_300_000,
			observedAt: measuredAt,
			source: "claude_statusline",
		},
	]);
	f.advance();
	await f.ingest(10, 20);
	expect(f.store.snapshot(f.scope)[0]?.observedAt).toBe(measuredAt);
});
test("a first restored frame remains a baseline even when proof warms", async () => {
	const f = fixture();
	await f.ingest(100, 45);
	f.advance();
	f.warm();
	await f.ingest(100, 45);
	expect(f.store.snapshot(f.scope)).toEqual([]);
	f.advance();
	await f.ingest(101, 45);
	expect(f.store.snapshot(f.scope)[0]?.observedAt).toBe(f.time());
});
test("rotation, invalid registration, unpinned accounts and ownership changes cannot acquire authority", async () => {
	const f = fixture();
	await f.ingest(0);
	f.advance();
	await f.ingest(1);
	f.warm();
	f.rotate();
	expect(await f.ingest(2)).toBe(false);
	expect(f.store.snapshot(f.scope)).toEqual([]);
	const other = fixture();
	other.warm();
	other.invalidate();
	expect(await other.ingest(0)).toBe(false);
	expect(
		await ingestNativeClaudeBinding(
			{ ...other.account, pinned: undefined },
			other.launch,
			{
				source: "claude_statusline",
				payload: other.frame(1),
				receivedAt: other.time(),
			},
			() => true,
			other.deps,
		),
	).toBe(false);
	expect(
		await ingestNativeClaudeBinding(
			other.account,
			other.launch,
			{
				source: "claude_statusline",
				payload: other.frame(1),
				receivedAt: other.time(),
			},
			() => false,
			other.deps,
		),
	).toBe(false);
});
test("promotion fences the original credential generation and cannot switch organizations twice", async () => {
	const f = fixture();
	expect(
		f.store.promoteLaunch({
			...f.launch,
			generation: "9".repeat(64),
			scope: f.scope,
		}),
	).toBe(false);
	await f.ingest(0);
	f.warm();
	await f.ingest(1);
	expect(
		f.store.promoteLaunch({
			...f.launch,
			generation: "a".repeat(64),
			scope: "d".repeat(64),
		}),
	).toBe(false);
});

test("asynchronous principal proof keeps the pre-validation receipt", async () => {
	const f = fixture();
	f.warm();
	await f.ingest(0);
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
	const resolveScope = f.deps.resolveScope;
	f.deps.resolveScope = async (...args) => {
		entered();
		await gate;
		return resolveScope(...args);
	};
	const delayed = f.ingest(1, 30);
	await waiting;
	f.advance(45_000);
	release();
	expect(await delayed).toBe(true);
	expect(f.store.snapshot(f.scope)[0]?.observedAt).toBe(receivedAt);
});

test("proof that completes after receipt expiry cannot promote a queued reading", async () => {
	const f = fixture();
	await f.ingest(0);
	f.advance();
	await f.ingest(1, 30);
	let release!: () => void;
	let entered!: () => void;
	const waiting = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const resolveScope = f.deps.resolveScope;
	f.deps.resolveScope = async (...args) => {
		entered();
		await gate;
		return resolveScope(...args);
	};
	f.warm();
	const replay = f.ingest(1, 30);
	await waiting;
	f.advance(6 * 60_000 + 1);
	release();
	expect(await replay).toBe(false);
	expect(f.store.snapshot(f.scope)).toEqual([]);
});

test("healthy captured frames resolve proof without redundant credential capture", async () => {
	const f = fixture();
	f.warm();
	let captures = 0;
	const capture = f.deps.captureGeneration;
	f.deps.captureGeneration = async (...args) => {
		captures++;
		return capture(...args);
	};
	await f.ingest(0);
	f.advance();
	expect(await f.ingest(1, 20)).toBe(true);
	expect(captures).toBe(0);
	expect(f.store.snapshot(f.scope)[0]?.usedPercent).toBe(20);
});
