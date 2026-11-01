import { expect, test } from "bun:test";
import { AgentModelCatalogCache } from "./AgentModelCatalogCache";

const catalog = { models: [{ id: "future", label: "Future" }], efforts: {} };

test("shares concurrent discovery, refreshes subsequent reads, and clears failed catalogs", async () => {
	const cache = new AgentModelCatalogCache();
	let reads = 0;
	const discover = async () => {
		reads++;
		return catalog;
	};
	await Promise.all([
		cache.load("account-a", discover),
		cache.load("account-a", discover),
	]);
	expect(reads).toBe(1);
	expect(cache.peek("account-b")).toBeNull();
	await cache.load("account-a", discover);
	expect(reads).toBe(2);
	await expect(
		cache.load("account-a", async () => {
			throw new Error("failed");
		}),
	).rejects.toThrow("failed");
	expect(cache.peek("account-a")).toBeNull();
});

test("preserves a successful empty catalog", async () => {
	const cache = new AgentModelCatalogCache();
	expect(
		await cache.load("account-a", async () => ({ models: [], efforts: {} })),
	).toEqual({ models: [], efforts: {} });
});
