import { describe, expect, test } from "bun:test";
import type { Bucket } from "../r2";
import { type SweepDeps, sweepOrganizationPluginBundles } from "./bundles";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const HOURS = 60 * 60 * 1000;

function deps(
	objects: Partial<Record<Bucket, { key: string; ageHours: number }[]>>,
	referenced: { organizationId: string; contentHash: string }[],
	deleted: Record<string, string[]>,
): SweepDeps {
	return {
		listObjects: async (_prefix, options) =>
			(objects[options?.bucket ?? "private"] ?? []).map((object) => ({
				key: object.key,
				lastModified: new Date(NOW - object.ageHours * HOURS),
			})),
		deleteObjects: async (keys, options) => {
			deleted[options?.bucket ?? "private"] = [...keys];
		},
		referencedPlugins: async () => referenced,
	};
}

describe("sweepOrganizationPluginBundles", () => {
	test("deletes bundles and icons no plugin points at, such as a removed source's", async () => {
		const deleted: Record<string, string[]> = {};
		const result = await sweepOrganizationPluginBundles(
			NOW,
			deps(
				{
					private: [
						{ key: "organization-plugins/org-1/live.json.gz", ageHours: 48 },
						{ key: "organization-plugins/org-1/gone.json.gz", ageHours: 48 },
						{
							key: "organization-plugins/org-2/deleted-org.json.gz",
							ageHours: 48,
						},
					],
					public: [
						{ key: "organization-plugins/org-1/live/icon", ageHours: 48 },
						{ key: "organization-plugins/org-1/gone/icon", ageHours: 48 },
					],
				},
				[{ organizationId: "org-1", contentHash: "live" }],
				deleted,
			),
		);
		expect(result.swept).toBe(3);
		expect(deleted).toEqual({
			private: [
				"organization-plugins/org-1/gone.json.gz",
				"organization-plugins/org-2/deleted-org.json.gz",
			],
			public: ["organization-plugins/org-1/gone/icon"],
		});
	});

	test("keeps a bundle a sync uploaded but has not recorded yet", async () => {
		const deleted: Record<string, string[]> = {};
		const result = await sweepOrganizationPluginBundles(
			NOW,
			deps(
				{
					private: [
						{ key: "organization-plugins/org-1/fresh.json.gz", ageHours: 0.1 },
					],
				},
				[],
				deleted,
			),
		);
		expect(result.swept).toBe(0);
		expect(deleted).toEqual({});
	});
});
