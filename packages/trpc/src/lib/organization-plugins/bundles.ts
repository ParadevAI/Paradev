import { db } from "@superset/db/client";
import { organizationPlugins } from "@superset/db/schema";
import { deleteObjects, listObjects } from "../r2";
import { organizationBundleKey } from "./rules";

const BUNDLE_PREFIX = "organization-plugins/";
const UPLOAD_GRACE_MS = 60 * 60 * 1000;

export interface SweepDeps {
	listObjects: typeof listObjects;
	deleteObjects: typeof deleteObjects;
	referencedKeys(): Promise<Set<string>>;
}

const defaultDeps: SweepDeps = {
	listObjects,
	deleteObjects,
	async referencedKeys() {
		const rows = await db
			.select({
				organizationId: organizationPlugins.organizationId,
				contentHash: organizationPlugins.contentHash,
			})
			.from(organizationPlugins);
		return new Set(
			rows.map((row) =>
				organizationBundleKey(row.organizationId, row.contentHash),
			),
		);
	},
};

/**
 * Deletes plugin bundles no organization plugin points at: those of a removed
 * source or a deleted organization, whose rows cascaded away, and any delete
 * that failed. A bundle younger than an hour is kept, since a sync uploads it
 * before it writes the row.
 */
export async function sweepOrganizationPluginBundles(
	now = Date.now(),
	deps: SweepDeps = defaultDeps,
): Promise<{ swept: number }> {
	const [objects, referenced] = await Promise.all([
		deps.listObjects(BUNDLE_PREFIX),
		deps.referencedKeys(),
	]);
	const orphans = objects
		.filter(
			(object) =>
				!referenced.has(object.key) &&
				(object.lastModified?.getTime() ?? now) < now - UPLOAD_GRACE_MS,
		)
		.map((object) => object.key);
	if (orphans.length) await deps.deleteObjects(orphans);
	return { swept: orphans.length };
}
