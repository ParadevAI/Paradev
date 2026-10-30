import { describe, expect, test } from "bun:test";
import type { AgentModelCatalog } from "@superset/shared/agent-models";
import { AgentModelCatalogCache } from "./AgentModelCatalogCache";

const catalog: AgentModelCatalog = {
	models: [{ id: "gpt-7-nova", label: "GPT-7 Nova" }],
	efforts: {},
};

function setup() {
	let now = 0;
	const cache = new AgentModelCatalogCache({
		ttlMs: 100,
		failureTtlMs: 10,
		now: () => now,
	});
	return { cache, advance: (ms: number) => (now += ms) };
}

describe("AgentModelCatalogCache", () => {
	test("reads once per TTL and shares a read in flight", async () => {
		const { cache, advance } = setup();
		let reads = 0;
		const discover = async () => {
			reads++;
			return catalog;
		};
		const [first, second] = await Promise.all([
			cache.load("codex", discover),
			cache.load("codex", discover),
		]);
		expect(first).toEqual(catalog);
		expect(second).toEqual(catalog);
		expect(cache.peek("codex")).toEqual(catalog);
		await cache.load("codex", discover);
		expect(reads).toBe(1);
		advance(100);
		await cache.load("codex", discover);
		expect(reads).toBe(2);
	});

	test("keeps the last good catalog when a refresh fails", async () => {
		const { cache, advance } = setup();
		await cache.load("codex", async () => catalog);
		advance(100);
		const refreshed = await cache.load("codex", async () => {
			throw new Error("codex not signed in");
		});
		expect(refreshed).toEqual(catalog);
	});

	test("retries a failed read after the shorter failure TTL", async () => {
		const { cache, advance } = setup();
		let reads = 0;
		const failing = async (): Promise<AgentModelCatalog> => {
			reads++;
			throw new Error("codex not installed");
		};
		expect(await cache.load("codex", failing)).toBeNull();
		await cache.load("codex", failing);
		expect(reads).toBe(1);
		advance(10);
		await cache.load("codex", failing);
		expect(reads).toBe(2);
	});

	test("treats an empty list as no catalog", async () => {
		const { cache } = setup();
		expect(
			await cache.load("codex", async () => ({ models: [], efforts: {} })),
		).toBeNull();
	});
});
