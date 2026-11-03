import { describe, expect, test } from "bun:test";
import { type SweepDeps, sweepOrganizationPluginBundles } from "./bundles";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const HOURS = 60 * 60 * 1000;

function deps(
	objects: { key: string; ageHours: number }[],
	referenced: string[],
	deleted: string[][],
): SweepDeps {
	return {
		listObjects: async () =>
			objects.map((object) => ({
				key: object.key,
				lastModified: new Date(NOW - object.ageHours * HOURS),
			})),
		deleteObjects: async (keys) => {
			deleted.push([...keys]);
		},
		referencedKeys: async () => new Set(referenced),
	};
}

describe("sweepOrganizationPluginBundles", () => {
	test("deletes bundles no plugin points at, such as a removed source's", async () => {
		const deleted: string[][] = [];
		const result = await sweepOrganizationPluginBundles(
			NOW,
			deps(
				[
					{ key: "organization-plugins/org-1/live.json.gz", ageHours: 48 },
					{ key: "organization-plugins/org-1/gone.json.gz", ageHours: 48 },
					{
						key: "organization-plugins/org-2/deleted-org.json.gz",
						ageHours: 48,
					},
				],
				["organization-plugins/org-1/live.json.gz"],
				deleted,
			),
		);
		expect(result.swept).toBe(2);
		expect(deleted).toEqual([
			[
				"organization-plugins/org-1/gone.json.gz",
				"organization-plugins/org-2/deleted-org.json.gz",
			],
		]);
	});

	test("keeps a bundle a sync uploaded but has not recorded yet", async () => {
		const deleted: string[][] = [];
		const result = await sweepOrganizationPluginBundles(
			NOW,
			deps(
				[{ key: "organization-plugins/org-1/fresh.json.gz", ageHours: 0.1 }],
				[],
				deleted,
			),
		);
		expect(result.swept).toBe(0);
		expect(deleted).toEqual([]);
	});
});
