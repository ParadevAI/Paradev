import { db } from "@superset/db/client";
import { organizationPlugins } from "@superset/db/schema";
import { type Bucket, deleteObjects, listObjects } from "../r2";
import { organizationBundleKey, organizationIconKey } from "./rules";

const BUNDLE_PREFIX = "organization-plugins/";
const UPLOAD_GRACE_MS = 60 * 60 * 1000;

const STORED: { bucket: Bucket; keyOf: typeof organizationBundleKey }[] = [
	{ bucket: "private", keyOf: organizationBundleKey },
	{ bucket: "public", keyOf: organizationIconKey },
];

export interface SweepDeps {
	listObjects: typeof listObjects;
	deleteObjects: typeof deleteObjects;
	referencedPlugins(): Promise<
		{ organizationId: string; contentHash: string }[]
	>;
}

const defaultDeps: SweepDeps = {
	listObjects,
	deleteObjects,
	referencedPlugins: () =>
		db
			.select({
				organizationId: organizationPlugins.organizationId,
				contentHash: organizationPlugins.contentHash,
			})
			.from(organizationPlugins),
};

/**
 * Deletes plugin bundles and icons no organization plugin points at: those of
 * a removed source or a deleted organization, whose rows cascaded away, and
 * any delete that failed. An object younger than an hour is kept, since a sync
 * uploads it before it writes the row.
 */
export async function sweepOrganizationPluginBundles(
	now = Date.now(),
	deps: SweepDeps = defaultDeps,
): Promise<{ swept: number }> {
	const plugins = await deps.referencedPlugins();
	let swept = 0;
	for (const { bucket, keyOf } of STORED) {
		const referenced = new Set(
			plugins.map((plugin) => keyOf(plugin.organizationId, plugin.contentHash)),
		);
		const orphans = (await deps.listObjects(BUNDLE_PREFIX, { bucket }))
			.filter(
				(object) =>
					!referenced.has(object.key) &&
					(object.lastModified?.getTime() ?? now) < now - UPLOAD_GRACE_MS,
			)
			.map((object) => object.key);
		if (orphans.length) await deps.deleteObjects(orphans, { bucket });
		swept += orphans.length;
	}
	return { swept };
}
