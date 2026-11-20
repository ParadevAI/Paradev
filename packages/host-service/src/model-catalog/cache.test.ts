import { expect, test } from "bun:test";
import type { AgentModelCatalog } from "@superset/shared/agent-models";
import { ModelCatalogCache } from "./cache";

const live: AgentModelCatalog = {
	models: [{ id: "private/new", label: "New" }],
	source: "runtime",
	availability: "reported",
	fetchedAt: 1,
	stale: false,
};
const fallback = (): AgentModelCatalog => ({
	models: [],
	source: "bundled",
	availability: "unknown",
	fetchedAt: 0,
	stale: true,
});

test("concurrent requests share discovery and account scopes stay separate", async () => {
	const cache = new ModelCatalogCache();
	let loads = 0;
	const load = async () => {
		loads++;
		return live;
	};
	await Promise.all([
		cache.get("account-a", load, fallback),
		cache.get("account-a", load, fallback),
	]);
	expect(loads).toBe(1);
	expect(cache.peek("account-b")).toBeUndefined();
	await cache.get("account-b", load, fallback);
	expect(loads).toBe(2);
});
test("repeated outages retain the last successful models without claiming availability", async () => {
	let now = 0;
	const cache = new ModelCatalogCache(() => now, 10);
	await cache.get("a", async () => live, fallback);
	const fail = async (): Promise<AgentModelCatalog> => {
		throw new Error("offline");
	};
	for (let i = 0; i < 2; i++) {
		now += 11;
		expect(await cache.get("a", fail, fallback)).toEqual({
			...live,
			stale: true,
			availability: "unknown",
		});
	}
});
test("an authoritative empty model list replaces the prior list", async () => {
	const cache = new ModelCatalogCache();
	await cache.get("a", async () => live, fallback);
	expect(
		(
			await cache.get(
				"a",
				async () => ({ ...live, models: [] }),
				fallback,
				true,
			)
		).models,
	).toEqual([]);
});
