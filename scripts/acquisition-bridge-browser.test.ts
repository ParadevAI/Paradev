import { expect, test } from "bun:test";
import { LINEAGE_CAS_SCRIPT } from "../packages/shared/src/acquisition-bridge/server";
import { FixtureStore } from "./acquisition-bridge-browser";

test("browser fixture CAS allows only one simultaneous revision claim", async () => {
	const store = new FixtureStore();
	await store.set("lineage", { revision: 1 });
	const results = await Promise.all([
		store.eval(
			LINEAGE_CAS_SCRIPT,
			["lineage"],
			[1, JSON.stringify({ revision: 2, ownerId: "a" }), 60],
		),
		store.eval(
			LINEAGE_CAS_SCRIPT,
			["lineage"],
			[1, JSON.stringify({ revision: 2, ownerId: "b" }), 60],
		),
	]);
	expect(results).toEqual([1, 0]);
	await store.set("expired", { revision: 1 }, { ex: -1 });
	expect(await store.eval(LINEAGE_CAS_SCRIPT, ["expired"], [1, "{}", 60])).toBe(
		0,
	);
});
