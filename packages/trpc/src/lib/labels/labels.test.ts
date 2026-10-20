import { describe, expect, test } from "bun:test";
import { ensureLabels } from "./labels";

type Row = { id: string; name: string; parentId: string | null };

function fakeExecutor(existing: Row[]) {
	const rows = [...existing];
	const parentIds: string[] = [];
	const executor = {
		insert: () => ({
			values: (values: Array<{ name: string }>) => ({
				onConflictDoNothing: async () => {
					for (const { name } of values) {
						if (!rows.some((row) => row.name === name)) {
							rows.push({ id: `id:${name}`, name, parentId: null });
						}
					}
				},
			}),
		}),
		select: () => ({
			from: () => ({ where: async () => rows }),
		}),
		update: () => ({
			set: ({ parentId }: { parentId: string }) => ({
				where: async () => {
					parentIds.push(parentId);
				},
			}),
		}),
	};
	return { executor: executor as never, rows, parentIds };
}

describe("ensureLabels", () => {
	test("creates path parents and links each label to its parent", async () => {
		const fake = fakeExecutor([]);
		const labels = await ensureLabels(fake.executor, "org-1", [
			" Acme / Web / API ",
		]);

		expect(labels).toEqual([{ id: "id:acme/web/api", name: "acme/web/api" }]);
		expect(fake.rows.map((row) => row.name).sort()).toEqual([
			"acme",
			"acme/web",
			"acme/web/api",
		]);
		expect(fake.parentIds.sort()).toEqual(["id:acme", "id:acme/web"]);
	});

	test("leaves a label alone when its parent is already linked", async () => {
		const fake = fakeExecutor([
			{ id: "id:acme", name: "acme", parentId: null },
			{ id: "id:acme/web", name: "acme/web", parentId: "id:acme" },
		]);
		await ensureLabels(fake.executor, "org-1", ["acme/web"]);
		expect(fake.parentIds).toEqual([]);
	});
});
