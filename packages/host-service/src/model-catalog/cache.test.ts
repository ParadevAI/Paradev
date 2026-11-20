import { expect, test } from "bun:test";
import type { AgentModelCatalog } from "@superset/shared/agent-models";
import { ModelCatalogCache } from "./cache";

const catalog: AgentModelCatalog = {
	models: [{ id: "one", label: "One" }],
	availability: "reported",
};

test("callers share one probe and its result until it expires", async () => {
	let now = 0;
	let loads = 0;
	const cache = new ModelCatalogCache(() => now, 10);
	const load = async () => {
		loads++;
		return catalog;
	};
	await Promise.all([cache.get("key", load), cache.get("key", load)]);
	await cache.get("key", load);
	expect(loads).toBe(1);
	now = 11;
	await cache.get("key", load);
	expect(loads).toBe(2);
});
